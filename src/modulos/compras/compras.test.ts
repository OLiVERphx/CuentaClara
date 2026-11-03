import { beforeEach, describe, expect, it } from 'vitest';
import { guardarDispositivo, guardarNegocio, NEGOCIO_PREDETERMINADO } from '../../core/config/config';
import { db } from '../../core/db/db';
import { fijarDispositivo } from '../../core/db/registro';
import { ErrorPermiso } from '../../core/errores';
import { guardarTasaAutomatica } from '../../core/tasa/servicio';
import { hoyLocal } from '../../core/util/fechas';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { resumirCaja } from '../caja/calculos';
import { movimientosDeSesion, sesionAbierta } from '../caja/consultas';
import { registrarOyentesCaja } from '../caja/oyentes';
import { abrirCaja } from '../caja/servicio';
import { registrarOyentesInventario } from '../inventario/oyentes';
import { crearProducto, listarMovimientos, obtenerCatalogo } from '../inventario/servicio';
import type { Producto } from '../inventario/tipos';
import { aMonedaDeuda, costoBaseUsd, estadoDePago, urgencia } from './calculos';
import { guardarProveedor, listarCompras, obtenerCompra, registrarCompra, registrarPagoCompra, type DatosCompra } from './servicio';

const TASA = 8_895_754; // 889,5754 Bs/USD

describe('cálculos de compras', () => {
  it('costo por unidad base en USD', () => {
    expect(costoBaseUsd(2500, 'USD', 20_000, TASA)).toBe(12_500); // bulto x20 a $25 → $1,25
    expect(costoBaseUsd(95, 'USD', 1000, TASA)).toBe(9500);
    expect(costoBaseUsd(88_958, 'VES', 1000, TASA)).toBe(10_000); // Bs 889,58 → $1,00
    expect(costoBaseUsd(650, 'USD', 500, TASA)).toBe(130_000); // medio kilo a $6,50 → $13/kg
  });

  it('convierte pagos a la moneda de la deuda', () => {
    expect(aMonedaDeuda(88_958, 'VES', 'USD', TASA)).toBe(100);
    expect(aMonedaDeuda(100, 'USD', 'VES', TASA)).toBe(88_958);
    expect(aMonedaDeuda(500, 'USD', 'USD', TASA)).toBe(500);
  });

  it('estado de pago y urgencia', () => {
    expect(estadoDePago(1000, 0)).toBe('pendiente');
    expect(estadoDePago(1000, 400)).toBe('parcial');
    expect(estadoDePago(1000, 1000)).toBe('pagada');
    expect(urgencia('2026-11-01', '2026-11-02')).toBe('vencida');
    expect(urgencia('2026-11-04', '2026-11-02')).toBe('pronto');
    expect(urgencia('2026-11-20', '2026-11-02')).toBe('al_dia');
    expect(urgencia(null, '2026-11-02')).toBe('sin_fecha');
  });
});

describe('servicio de compras', () => {
  let harina: Producto;
  let bultoId: string;
  let proveedorId: string;

  const compra = (extra: Partial<DatosCompra> = {}): DatosCompra => ({
    proveedorId,
    fecha: hoyLocal(),
    facturaProveedor: 'F-001',
    moneda: 'USD',
    items: [{ productoId: harina.id, presentacionId: bultoId, cantidad: 2000, costoUnitario: 2400 }], // 2 bultos x20 a $24
    vencimiento: null,
    pagoInicial: null,
    notas: '',
    ...extra,
  });

  beforeEach(async () => {
    await reiniciarBase();
    sesionDePrueba();
    await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Bodega de prueba' });
    await guardarDispositivo({ id: 'laptop', nombre: 'Laptop', prefijo: 'L' });
    fijarDispositivo('laptop');
    await guardarTasaAutomatica(hoyLocal(), TASA);
    registrarOyentesInventario();
    registrarOyentesCaja();
    harina = await crearProducto(
      {
        codigo: '',
        codigoBarras: '',
        nombre: 'Harina',
        categoriaId: null,
        unidad: 'unidad',
        monedaPrecio: 'USD',
        precio: 125,
        costoPromedio: 10_000,
        stockMinimo: 0,
        activo: true,
      },
      [{ nombre: 'Bulto x20', factor: 20_000, precio: null, codigoBarras: '', paraVenta: false, paraCompra: true }],
      10_000,
    );
    bultoId = (await obtenerCatalogo()).presentaciones[0]!.id;
    proveedorId = (await guardarProveedor(null, { nombre: 'Distribuidora El Sol', rif: 'j-123', telefono: '', contacto: '', nota: '', activo: true })).id;
    await abrirCaja({ fondoBs: 0, fondoUsd: 10_000 });
  });

  it('suma el stock por bultos y recalcula el costo promedio', async () => {
    const r = await registrarCompra(compra());
    expect(r.compra).toMatchObject({ numero: 'L-C00001', total: 4800, pagado: 0, estadoPago: 'pendiente' });
    const p = (await db.productos.get(harina.id))!;
    expect(p.stock).toBe(50_000); // 10 + 40
    // 10 a $1,00 + 40 a $1,20 → $1,16
    expect(p.costoPromedio).toBe(11_600);
    const [mov] = await listarMovimientos(harina.id, 1);
    expect(mov).toMatchObject({ tipo: 'entrada_compra', cantidad: 40_000, costoUnitario: 12_000, documentoId: r.compra.id });
  });

  it('pagada en efectivo desde la caja: baja el efectivo esperado', async () => {
    const r = await registrarCompra(compra({ pagoInicial: { metodo: 'efectivo_usd', monto: 4800, desdeCaja: true } }));
    expect(r.compra.estadoPago).toBe('pagada');
    const sesion = (await sesionAbierta())!;
    const resumen = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(resumen.esperadoUsd).toBe(10_000 - 4800);
    expect(resumen.pagosProveedoresBs).toBeGreaterThan(0);
  });

  it('a crédito y luego abonos en Bs a una deuda en USD', async () => {
    const { compra: c } = await registrarCompra(compra({ vencimiento: '2026-11-15' }));
    // Bs 889,58 → $1,00
    await registrarPagoCompra(c.id, { metodo: 'pago_movil', monto: 88_958, desdeCaja: false, referencia: '1234' });
    let actual = (await obtenerCompra(c.id))!;
    expect(actual.compra).toMatchObject({ pagado: 100, estadoPago: 'parcial' });
    expect(actual.pagos[0]).toMatchObject({ aplicado: 100, referencia: '1234', desdeCaja: false });

    await expect(registrarPagoCompra(c.id, { metodo: 'efectivo_usd', monto: 5000, desdeCaja: false })).rejects.toThrow('supera');
    await registrarPagoCompra(c.id, { metodo: 'efectivo_usd', monto: 4700, desdeCaja: false });
    actual = (await obtenerCompra(c.id))!;
    expect(actual.compra.estadoPago).toBe('pagada');
    await expect(registrarPagoCompra(c.id, { metodo: 'efectivo_usd', monto: 1, desdeCaja: false })).rejects.toThrow('ya está pagada');
    expect(await listarCompras({ soloPendientes: true })).toHaveLength(0);
  });

  it('una deuda en Bs fijo se salda con su equivalente en $ (tolerando la conversión)', async () => {
    const { compra: c } = await registrarCompra(
      compra({ moneda: 'VES', items: [{ productoId: harina.id, presentacionId: null, cantidad: 10_000, costoUnitario: 88_958 }] }),
    );
    expect(c.total).toBe(889_580);
    // $10 = Bs 8.895,75: faltan 5 céntimos, menos que un centavo de dólar → saldada.
    await registrarPagoCompra(c.id, { metodo: 'efectivo_usd', monto: 1000, desdeCaja: false });
    expect((await obtenerCompra(c.id))!.compra).toMatchObject({ estadoPago: 'pagada', pagado: 889_580 });
  });

  it('pagando en la misma moneda no se perdona ni un céntimo', async () => {
    const { compra: c } = await registrarCompra(
      compra({ moneda: 'VES', items: [{ productoId: harina.id, presentacionId: null, cantidad: 10_000, costoUnitario: 88_958 }] }),
    );
    await registrarPagoCompra(c.id, { metodo: 'pago_movil', monto: 889_579, desdeCaja: false });
    expect((await obtenerCompra(c.id))!.compra).toMatchObject({ estadoPago: 'parcial', pagado: 889_579 });
  });

  it('valida unidades enteras, permisos y caja abierta', async () => {
    await expect(registrarCompra(compra({ items: [{ productoId: harina.id, presentacionId: null, cantidad: 1500, costoUnitario: 100 }] }))).rejects.toThrow(
      'unidades enteras',
    );
    sesionDePrueba('cajero');
    await expect(registrarCompra(compra())).rejects.toThrow(ErrorPermiso);
  });
});
