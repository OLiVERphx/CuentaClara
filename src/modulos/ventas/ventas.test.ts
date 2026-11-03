import { beforeEach, describe, expect, it } from 'vitest';
import { guardarDispositivo, guardarNegocio, NEGOCIO_PREDETERMINADO } from '../../core/config/config';
import { db } from '../../core/db/db';
import { fijarDispositivo } from '../../core/db/registro';
import { ErrorNegocio, ErrorPermiso } from '../../core/errores';
import { guardarTasaAutomatica } from '../../core/tasa/servicio';
import { hoyLocal } from '../../core/util/fechas';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { resumirCaja } from '../caja/calculos';
import { movimientosDeSesion, sesionAbierta } from '../caja/consultas';
import { registrarOyentesCaja } from '../caja/oyentes';
import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimientoManual } from '../caja/servicio';
import { registrarOyentesInventario } from '../inventario/oyentes';
import { crearProducto, obtenerCatalogo } from '../inventario/servicio';
import type { Producto } from '../inventario/tipos';
import { calcularLinea, estadoCobro, lineaDesdeProducto, montoSugerido, totalizar, type PagoTicket } from './calculos';
import { anularVenta, obtenerVenta, registrarDevolucion, registrarVenta, ventasDelDia } from './servicio';

const TASA = 8_895_754; // 889,5754 Bs/USD
const AL_BOLIVAR = { paso: 100, modo: 'cercano' as const };

let harina: Producto;
let queso: Producto;
let bultoId: string;

async function stock(id: string): Promise<number> {
  return (await db.productos.get(id))!.stock;
}

async function preparar(opciones: { permitirStockNegativo?: boolean; abrir?: boolean } = {}) {
  await reiniciarBase();
  sesionDePrueba();
  await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Bodega de prueba', permitirStockNegativo: opciones.permitirStockNegativo ?? true });
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
      costoPromedio: 9500,
      stockMinimo: 0,
      activo: true,
    },
    [{ nombre: 'Bulto x20', factor: 20_000, precio: 2350, codigoBarras: '', paraVenta: true, paraCompra: true }],
    50_000,
  );
  bultoId = (await obtenerCatalogo()).presentaciones[0]!.id;
  queso = await crearProducto(
    {
      codigo: '',
      codigoBarras: '',
      nombre: 'Queso',
      categoriaId: null,
      unidad: 'kg',
      monedaPrecio: 'USD',
      precio: 800,
      costoPromedio: 65_000,
      stockMinimo: 0,
      activo: true,
    },
    [],
    3500,
  );
  if (opciones.abrir ?? true) await abrirCaja({ fondoBs: 1_000_000, fondoUsd: 2000 });
}

function totalesDe(lineas: { producto: Producto; cantidad: number }[]) {
  return totalizar(lineas.map((l) => calcularLinea(lineaDesdeProducto(l.producto, null, l.cantidad), TASA, AL_BOLIVAR)));
}

describe('cálculos de la venta', () => {
  beforeEach(() => preparar({ abrir: false }));

  it('suma líneas con el precio en Bs redondeado', () => {
    const t = totalesDe([
      { producto: harina, cantidad: 3000 },
      { producto: queso, cantidad: 350 },
    ]);
    // 3 × Bs 1.112 + 0,350 kg × Bs 7.117 (= 2.491)
    expect(t).toMatchObject({ totalBs: 582_700, totalUsd: 655 });
  });

  it('una presentación usa su precio propio y descuenta sus unidades base', () => {
    const bulto = { id: bultoId, productoId: harina.id, nombre: 'Bulto x20', factor: 20_000, precio: 2350 } as never;
    const l = calcularLinea(lineaDesdeProducto(harina, bulto, 2000), TASA, AL_BOLIVAR);
    expect(l).toMatchObject({ cantidadBase: 40_000, precioUnitarioBs: 2_090_500, subtotalBs: 4_181_000, subtotalUsd: 4700 });
  });

  describe('cobro', () => {
    let t: ReturnType<typeof totalesDe>;
    beforeEach(() => {
      t = totalesDe([
        { producto: harina, cantidad: 3000 },
        { producto: queso, cantidad: 350 },
      ]);
    });
    const pago = (metodo: PagoTicket['metodo'], monto: number, esVuelto = false): PagoTicket => ({ metodo, monto, esVuelto });

    it('cuadra pagando todo en Bs o todo en $', () => {
      expect(estadoCobro(t, [pago('pago_movil', 582_700)], TASA, 100).cuadrado).toBe(true);
      expect(estadoCobro(t, [pago('efectivo_usd', 655)], TASA, 100).cuadrado).toBe(true);
    });

    it('calcula lo que falta en un pago mixto y lo sugiere por método', () => {
      const e = estadoCobro(t, [pago('efectivo_usd', 500)], TASA, 100);
      expect(e.cuadrado).toBe(false);
      expect(e.faltanteBs).toBe(137_891);
      expect(e.faltanteUsd).toBe(155);
      expect(montoSugerido('pago_movil', e, false, AL_BOLIVAR)).toBe(137_891);
      // En efectivo se lleva al bolívar y la diferencia de céntimos se tolera.
      const efectivo = montoSugerido('efectivo_bs', e, false, AL_BOLIVAR);
      expect(efectivo).toBe(137_900);
      expect(estadoCobro(t, [pago('efectivo_usd', 500), pago('efectivo_bs', efectivo)], TASA, 100).cuadrado).toBe(true);
    });

    it('no acepta que falte un bolívar entero', () => {
      expect(estadoCobro(t, [pago('pago_movil', 582_600)], TASA, 100).cuadrado).toBe(false);
    });

    it('si se paga el resto en $, tolera la fracción de centavo', () => {
      const e = estadoCobro(t, [pago('pago_movil', 300_000)], TASA, 100);
      const usd = montoSugerido('efectivo_usd', e, false, AL_BOLIVAR);
      expect(usd).toBe(318);
      expect(estadoCobro(t, [pago('pago_movil', 300_000), pago('efectivo_usd', usd)], TASA, 100).cuadrado).toBe(true);
    });

    it('calcula el vuelto y cuadra al registrarlo', () => {
      const soloHarina = totalesDe([{ producto: harina, cantidad: 1000 }]);
      const e = estadoCobro(soloHarina, [pago('efectivo_usd', 1000)], TASA, 100);
      expect(e).toMatchObject({ cuadrado: false, sobranteBs: 778_400, sobranteUsd: 875 });
      const vuelto = montoSugerido('efectivo_bs', e, true, AL_BOLIVAR);
      expect(estadoCobro(soloHarina, [pago('efectivo_usd', 1000), pago('efectivo_bs', vuelto, true)], TASA, 100).cuadrado).toBe(true);
    });
  });
});

describe('registrar venta', () => {
  beforeEach(() => preparar());

  it('guarda la venta, descuenta el stock y registra los cobros en la caja', async () => {
    // $30 no alcanza el total de $30,05: debe pedir el resto.
    await expect(
      registrarVenta({
        lineas: [
          { productoId: harina.id, presentacionId: null, cantidad: 3000 },
          { productoId: harina.id, presentacionId: bultoId, cantidad: 1000 },
          { productoId: queso.id, presentacionId: null, cantidad: 350 },
        ],
        pagos: [{ metodo: 'efectivo_usd', monto: 3000, esVuelto: false }],
      }),
    ).rejects.toThrow(ErrorNegocio);

    const venta = await registrarVenta({
      lineas: [
        { productoId: harina.id, presentacionId: null, cantidad: 3000 },
        { productoId: harina.id, presentacionId: bultoId, cantidad: 1000 },
        { productoId: queso.id, presentacionId: null, cantidad: 350 },
      ],
      pagos: [{ metodo: 'efectivo_usd', monto: 3005, esVuelto: false }],
    });
    expect(venta.venta).toMatchObject({ numero: 'L-000001', totalUsd: 3005, estado: 'completada', tasa: TASA });
    const guardada = (await obtenerVenta(venta.venta.id))!;
    expect(guardada.items.map((i) => i.descripcion)).toEqual(['Harina', 'Harina (Bulto x20)', 'Queso']);
    expect(await stock(harina.id)).toBe(50_000 - 3000 - 20_000);
    expect(await stock(queso.id)).toBe(3150);

    const sesion = (await sesionAbierta())!;
    const resumen = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(resumen.ventas).toBe(1);
    expect(resumen.esperadoUsd).toBe(2000 + 3005);
    expect(resumen.vendidoBs).toBe(venta.venta.totalBs);
  });

  it('numera las ventas en orden', async () => {
    const vender = () =>
      registrarVenta({ lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1000 }], pagos: [{ metodo: 'pago_movil', monto: 111_200, esVuelto: false }] });
    await vender();
    expect((await vender()).venta.numero).toBe('L-000002');
    expect(await ventasDelDia()).toHaveLength(2);
  });

  it('con vuelto: la caja registra la entrada en $ y la salida en Bs', async () => {
    await registrarVenta({
      lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1000 }],
      pagos: [
        { metodo: 'efectivo_usd', monto: 1000, esVuelto: false },
        { metodo: 'efectivo_bs', monto: 778_400, esVuelto: true },
      ],
    });
    const sesion = (await sesionAbierta())!;
    const r = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(r.esperadoUsd).toBe(3000);
    expect(r.esperadoBs).toBe(1_000_000 - 778_400);
    expect(r.vendidoBs).toBe(111_200);
  });

  it('sin caja abierta no se vende', async () => {
    await cerrarCaja({ contadoBs: 1_000_000, contadoUsd: 2000, nota: '' });
    await expect(
      registrarVenta({ lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1000 }], pagos: [{ metodo: 'pago_movil', monto: 111_200, esVuelto: false }] }),
    ).rejects.toThrow('caja está cerrada');
  });

  it('valida cantidades enteras en productos por unidad', async () => {
    await expect(
      registrarVenta({ lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1500 }], pagos: [{ metodo: 'pago_movil', monto: 166_800, esVuelto: false }] }),
    ).rejects.toThrow('unidades enteras');
  });

  it('usa el precio actual de la base, no el de la pantalla', async () => {
    await db.productos.update(harina.id, { precio: 200 });
    await expect(
      registrarVenta({ lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 1000 }], pagos: [{ metodo: 'pago_movil', monto: 111_200, esVuelto: false }] }),
    ).rejects.toThrow('Falta cobrar');
  });
});

describe('stock insuficiente sin permitir negativo', () => {
  beforeEach(() => preparar({ permitirStockNegativo: false }));

  it('rechaza la venta y no deja nada a medias', async () => {
    await expect(
      registrarVenta({
        lineas: [
          { productoId: harina.id, presentacionId: null, cantidad: 1000 },
          { productoId: queso.id, presentacionId: null, cantidad: 5000 },
        ],
        pagos: [{ metodo: 'efectivo_usd', monto: 4125, esVuelto: false }],
      }),
    ).rejects.toThrow('No hay suficiente «Queso»');
    expect(await stock(harina.id)).toBe(50_000);
    expect(await db.ventas.count()).toBe(0);
    expect(await db.pagos.count()).toBe(0);
    expect(await db.movimientosCaja.count()).toBe(0);
  });
});

describe('anular y devolver', () => {
  let ventaId: string;
  beforeEach(async () => {
    await preparar();
    ventaId = (
      await registrarVenta({
        lineas: [{ productoId: harina.id, presentacionId: null, cantidad: 3000 }],
        pagos: [{ metodo: 'efectivo_bs', monto: 333_600, esVuelto: false }],
      })
    ).venta.id;
  });

  it('anular devuelve el stock y revierte la caja', async () => {
    sesionDePrueba('cajero');
    await expect(anularVenta(ventaId, 'error')).rejects.toThrow(ErrorPermiso);
    sesionDePrueba();
    await expect(anularVenta(ventaId, '  ')).rejects.toThrow('motivo');
    const anulada = await anularVenta(ventaId, 'Se cobró dos veces');
    expect(anulada.estado).toBe('anulada');
    expect(await stock(harina.id)).toBe(50_000);
    const sesion = (await sesionAbierta())!;
    const r = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(r).toMatchObject({ esperadoBs: 1_000_000, ventas: 0, vendidoBs: 0 });
    await expect(anularVenta(ventaId, 'otra vez')).rejects.toThrow('ya está anulada');
  });

  it('devolución parcial: reingresa stock, reintegra dinero y limita la cantidad', async () => {
    const d = await registrarDevolucion({
      ventaId,
      items: [{ ventaItemId: (await obtenerVenta(ventaId))!.items[0]!.id, cantidad: 1000 }],
      metodo: 'efectivo_bs',
      motivo: 'Paquete roto',
    });
    expect(d).toMatchObject({ numero: 'L-D00001', monto: 111_200, montoBs: 111_200, montoUsd: 125 });
    expect(await stock(harina.id)).toBe(48_000);

    const completa = (await obtenerVenta(ventaId))!;
    await expect(
      registrarDevolucion({ ventaId, items: [{ ventaItemId: completa.items[0]!.id, cantidad: 3000 }], metodo: 'efectivo_bs', motivo: 'x' }),
    ).rejects.toThrow('solo quedan por devolver 2');
    await expect(anularVenta(ventaId, 'ya no')).rejects.toThrow('tiene devoluciones');

    const sesion = (await sesionAbierta())!;
    const r = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(r.esperadoBs).toBe(1_000_000 + 333_600 - 111_200);
    expect(r.vendidoBs).toBe(222_400);
  });
});

describe('caja', () => {
  beforeEach(() => preparar());

  it('no se abre dos veces', async () => {
    await expect(abrirCaja({ fondoBs: 0, fondoUsd: 0 })).rejects.toThrow('ya está abierta');
  });

  it('gastos y retiros bajan el efectivo esperado; el cierre guarda el arqueo', async () => {
    await registrarGasto({ categoria: 'bolsas', descripcion: 'Bolsas', metodo: 'efectivo_bs', monto: 50_000, desdeCaja: true });
    await registrarGasto({ categoria: 'servicios', descripcion: 'Internet', metodo: 'pago_movil', monto: 900_000, desdeCaja: false });
    await registrarMovimientoManual({ tipo: 'retiro_dueno', metodo: 'efectivo_usd', monto: 1000, descripcion: 'Para la casa' });
    const sesion = (await sesionAbierta())!;
    const r = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(r).toMatchObject({ esperadoBs: 950_000, esperadoUsd: 1000, gastosBs: 50_000 });
    expect(await db.gastos.count()).toBe(2);

    const cerrada = await cerrarCaja({ contadoBs: 940_000, contadoUsd: 1000, nota: 'Faltan 100 Bs' });
    expect(cerrada).toMatchObject({ estado: 'cerrada', esperadoBs: 950_000, contadoBs: 940_000, esperadoUsd: 1000 });
    expect(await sesionAbierta()).toBeNull();
  });

  it('el cajero no registra gastos ni retiros', async () => {
    sesionDePrueba('cajero');
    await expect(registrarMovimientoManual({ tipo: 'retiro_dueno', metodo: 'efectivo_bs', monto: 100, descripcion: '' })).rejects.toThrow(
      ErrorPermiso,
    );
  });
});
