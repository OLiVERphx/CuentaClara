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
import { crearProducto } from '../inventario/servicio';
import type { Producto } from '../inventario/tipos';
import type { PagoTicket } from '../ventas/calculos';
import { anularVenta, obtenerVenta, registrarDevolucion, registrarVenta } from '../ventas/servicio';
import { registrarOyentesClientes } from './oyentes';
import { crearCliente, movimientosDeCliente, registrarAbono, registrarAjusteCuenta } from './servicio';
import type { Cliente } from './tipos';

const TASA = 8_895_754;
let harina: Producto; // $1,25 → Bs 1.112
let maria: Cliente;

async function saldo(id = maria.id): Promise<number> {
  return (await db.clientes.get(id))!.saldoUsd;
}

/** Vende `unidades` harinas a María con los pagos indicados. */
function venderAMaria(unidades: number, pagos: PagoTicket[], clienteId: string | null = maria.id) {
  return registrarVenta({ lineas: [{ productoId: harina.id, presentacionId: null, cantidad: unidades * 1000 }], pagos, clienteId });
}

beforeEach(async () => {
  await reiniciarBase();
  sesionDePrueba();
  await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Bodega de prueba' });
  await guardarDispositivo({ id: 'laptop', nombre: 'Laptop', prefijo: 'L' });
  fijarDispositivo('laptop');
  await guardarTasaAutomatica(hoyLocal(), TASA);
  registrarOyentesInventario();
  registrarOyentesCaja();
  registrarOyentesClientes();
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
    [],
    100_000,
  );
  maria = await crearCliente({ nombre: 'María Pérez', cedula: 'V-12.345.678', telefono: '0414-1234567', limiteCreditoUsd: 2000, nota: '', activo: true });
  await abrirCaja({ fondoBs: 0, fondoUsd: 0 });
});

describe('clientes', () => {
  it('normaliza la cédula y no la repite', async () => {
    expect(maria.cedula).toBe('V-12345678');
    await expect(
      crearCliente({ nombre: 'Otra', cedula: 'v-12345678', telefono: '', limiteCreditoUsd: null, nota: '', activo: true }),
    ).rejects.toThrow('ya es de «María Pérez»');
  });

  it('el cajero no crea clientes ni ajusta cuentas', async () => {
    sesionDePrueba('cajero');
    await expect(crearCliente({ nombre: 'X', cedula: '', telefono: '', limiteCreditoUsd: null, nota: '', activo: true })).rejects.toThrow(
      ErrorPermiso,
    );
    await expect(registrarAjusteCuenta({ clienteId: maria.id, montoUsd: 100, motivo: 'x' })).rejects.toThrow(ErrorPermiso);
  });
});

describe('fiao', () => {
  it('fiar todo o una parte deja la deuda en USD y no toca la caja', async () => {
    await venderAMaria(2, [{ metodo: 'credito', monto: 250, esVuelto: false }]);
    expect(await saldo()).toBe(250);
    // Paga $1 en efectivo y fía el resto de 2 harinas ($1,50).
    await venderAMaria(2, [
      { metodo: 'efectivo_usd', monto: 100, esVuelto: false },
      { metodo: 'credito', monto: 150, esVuelto: false },
    ]);
    expect(await saldo()).toBe(400);
    const sesion = (await sesionAbierta())!;
    expect(resumirCaja(sesion, await movimientosDeSesion(sesion.id)).esperadoUsd).toBe(100);
    const movs = await movimientosDeCliente(maria.id);
    expect(movs.map((m) => [m.tipo, m.monto, m.saldoResultante])).toEqual([
      ['cargo', 150, 400],
      ['cargo', 250, 250],
    ]);
  });

  it('sin cliente no se fía', async () => {
    await expect(venderAMaria(1, [{ metodo: 'credito', monto: 125, esVuelto: false }], null)).rejects.toThrow('elige el cliente');
  });

  it('respeta el límite de crédito para el cajero y deshace toda la venta', async () => {
    sesionDePrueba('cajero');
    await expect(venderAMaria(20, [{ metodo: 'credito', monto: 2500, esVuelto: false }])).rejects.toThrow('superaría su límite de crédito');
    expect(await saldo()).toBe(0);
    expect(await db.ventas.count()).toBe(0);
    expect((await db.productos.get(harina.id))!.stock).toBe(100_000);
  });

  it('el dueño puede fiar por encima del límite', async () => {
    await venderAMaria(20, [{ metodo: 'credito', monto: 2500, esVuelto: false }]);
    expect(await saldo()).toBe(2500);
  });

  it('un abono en Bs se convierte con la tasa del día y entra a la caja', async () => {
    await venderAMaria(4, [{ metodo: 'credito', monto: 500, esVuelto: false }]);
    // Bs 2.000 / 889,5754 = $2,25
    const mov = await registrarAbono({ clienteId: maria.id, metodo: 'pago_movil', monto: 200_000, nota: '' });
    expect(mov).toMatchObject({ tipo: 'abono', monto: -225, montoOriginal: 200_000, saldoResultante: 275 });
    const sesion = (await sesionAbierta())!;
    const r = resumirCaja(sesion, await movimientosDeSesion(sesion.id));
    expect(r.abonosBs).toBe(200_000);
    expect(r.porMetodo.find((t) => t.metodo === 'pago_movil')!.neto).toBe(200_000);
    expect(r.vendidoBs).toBe(0);
  });

  it('el vuelto se puede dejar a favor y luego usarse en otra compra', async () => {
    // Paga $5 por una harina de $1,25 y deja $3,75 a favor.
    await venderAMaria(1, [
      { metodo: 'efectivo_usd', monto: 500, esVuelto: false },
      { metodo: 'saldo_a_favor', monto: 375, esVuelto: true },
    ]);
    expect(await saldo()).toBe(-375);
    await venderAMaria(3, [{ metodo: 'saldo_a_favor', monto: 375, esVuelto: false }]);
    expect(await saldo()).toBe(0);
    await expect(venderAMaria(1, [{ metodo: 'saldo_a_favor', monto: 125, esVuelto: false }])).rejects.toThrow('no alcanza');
  });

  it('anular una venta fiada borra la deuda; devolver a saldo a favor la baja', async () => {
    const fiada = await venderAMaria(2, [{ metodo: 'credito', monto: 250, esVuelto: false }]);
    await anularVenta(fiada.venta.id, 'Error');
    expect(await saldo()).toBe(0);

    const otra = await venderAMaria(3, [{ metodo: 'credito', monto: 375, esVuelto: false }]);
    const item = (await obtenerVenta(otra.venta.id))!.items[0]!;
    const dev = await registrarDevolucion({ ventaId: otra.venta.id, items: [{ ventaItemId: item.id, cantidad: 1000 }], metodo: 'saldo_a_favor', motivo: 'Roto' });
    expect(dev).toMatchObject({ moneda: 'USD', monto: 125 });
    expect(await saldo()).toBe(250);
    // No sale dinero de la caja.
    const sesion = (await sesionAbierta())!;
    expect(await movimientosDeSesion(sesion.id)).toHaveLength(0);
  });

  it('un ajuste carga deudas viejas del cuaderno', async () => {
    await registrarAjusteCuenta({ clienteId: maria.id, montoUsd: 1200, motivo: 'Deuda del cuaderno' });
    expect(await saldo()).toBe(1200);
  });
});
