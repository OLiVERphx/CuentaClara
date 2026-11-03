import { beforeEach, describe, expect, it } from 'vitest';
import { guardarDispositivo, guardarNegocio, NEGOCIO_PREDETERMINADO } from '../../core/config/config';
import { fijarDispositivo } from '../../core/db/registro';
import { guardarTasaAutomatica } from '../../core/tasa/servicio';
import { hoyLocal } from '../../core/util/fechas';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { registrarOyentesCaja } from '../caja/oyentes';
import { abrirCaja, registrarGasto } from '../caja/servicio';
import { registrarOyentesInventario } from '../inventario/oyentes';
import { crearProducto } from '../inventario/servicio';
import { anularVenta, obtenerVenta, registrarDevolucion, registrarVenta } from '../ventas/servicio';
import { rangoDe, resumirInventario, resumirPeriodo } from './calculos';
import { cargarPeriodo } from './consultas';

const TASA = 8_895_754;

describe('rangos de fechas', () => {
  it('calcula los períodos', () => {
    expect(rangoDe('hoy', '2026-11-02')).toEqual({ desde: '2026-11-02', hasta: '2026-11-02' });
    expect(rangoDe('ayer', '2026-11-01')).toEqual({ desde: '2026-10-31', hasta: '2026-10-31' });
    expect(rangoDe('7dias', '2026-11-02')).toEqual({ desde: '2026-10-27', hasta: '2026-11-02' });
    expect(rangoDe('mes', '2026-11-02')).toEqual({ desde: '2026-11-01', hasta: '2026-11-02' });
  });
});

describe('inventario', () => {
  it('valora a costo y cuenta agotados y bajos', () => {
    expect(
      resumirInventario([
        { stock: 10_000, costoPromedio: 10_000, stockMinimo: 5000, activo: true }, // 10 × $1
        { stock: 3000, costoPromedio: 25_000, stockMinimo: 5000, activo: true }, // 3 × $2,50 (bajo)
        { stock: 0, costoPromedio: 10_000, stockMinimo: 0, activo: true }, // agotado
        { stock: 50_000, costoPromedio: 10_000, stockMinimo: 0, activo: false }, // inactivo: no cuenta
      ]),
    ).toEqual({ valorUsd: 1750, agotados: 1, bajos: 1 });
  });
});

describe('resumen del período', () => {
  beforeEach(async () => {
    await reiniciarBase();
    sesionDePrueba();
    await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Bodega de prueba' });
    await guardarDispositivo({ id: 'laptop', nombre: 'Laptop', prefijo: 'L' });
    fijarDispositivo('laptop');
    await guardarTasaAutomatica(hoyLocal(), TASA);
    registrarOyentesInventario();
    registrarOyentesCaja();
    await abrirCaja({ fondoBs: 0, fondoUsd: 0 });
  });

  it('ventas netas, costo, ganancia, gastos, métodos y productos', async () => {
    const harina = await crearProducto(
      { codigo: '', codigoBarras: '', nombre: 'Harina', categoriaId: null, unidad: 'unidad', monedaPrecio: 'USD', precio: 125, costoPromedio: 10_000, stockMinimo: 0, activo: true },
      [],
      100_000,
    );
    const queso = await crearProducto(
      { codigo: '', codigoBarras: '', nombre: 'Queso', categoriaId: null, unidad: 'kg', monedaPrecio: 'USD', precio: 800, costoPromedio: 60_000, stockMinimo: 0, activo: true },
      [],
      10_000,
    );
    // Venta 1: 4 harinas ($5) en $.
    const v1 = await registrarVenta({
      lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 4000 }],
      pagos: [{ metodo: 'efectivo_usd', monto: 500, esVuelto: false }],
    });
    // Venta 2: 0,5 kg de queso ($4) por pago móvil.
    await registrarVenta({
      lineas: [{ productoId: queso.id, presentacionId: null, cantidad: 500 }],
      pagos: [{ metodo: 'pago_movil', monto: 355_850, esVuelto: false }],
    });
    // Venta 3: anulada, no cuenta.
    const v3 = await registrarVenta({
      lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1000 }],
      pagos: [{ metodo: 'efectivo_usd', monto: 125, esVuelto: false }],
    });
    await anularVenta(v3.venta.id, 'Prueba');
    // Devuelven 1 harina de la venta 1.
    const item = (await obtenerVenta(v1.venta.id))!.items[0]!;
    await registrarDevolucion({ ventaId: v1.venta.id, items: [{ ventaItemId: item.id, cantidad: 1000 }], metodo: 'efectivo_usd', motivo: 'x' });
    // Gasto de Bs 889,58 ($1).
    await registrarGasto({ categoria: 'bolsas', descripcion: 'Bolsas', metodo: 'efectivo_bs', monto: 88_958, desdeCaja: false });

    const hoy = hoyLocal();
    const r = resumirPeriodo(await cargarPeriodo(hoy, hoy), hoy, hoy);
    expect(r).toMatchObject({
      ventas: 2,
      anuladas: 1,
      ventasUsd: 900, // $5 + $4
      devolucionesUsd: 125,
      netoUsd: 775,
      costoUsd: 300 + 300, // 3 harinas a $1 + 0,5 kg a $6
      gananciaBrutaUsd: 175,
      gastosUsd: 100,
      gananciaNetaUsd: 75,
      ticketPromedioUsd: 450,
    });
    expect(r.margenBruto).toBe(2258); // 22,58 %
    expect(r.porDia).toEqual([{ fecha: hoy, ventas: 2, usd: 775, bs: r.netoBs }]);
    expect(r.porMetodo.map((m) => [m.metodo, m.monto, m.vuelto])).toEqual([
      ['pago_movil', 355_850, 0],
      ['efectivo_usd', 500, 0],
    ]);
    expect(r.productos.map((p) => [p.descripcion, p.cantidadBase, p.ventasUsd, p.gananciaUsd])).toEqual([
      ['Queso', 500, 400, 100],
      ['Harina', 3000, 375, 75],
    ]);
  });
});
