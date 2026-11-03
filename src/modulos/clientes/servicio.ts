import { auditar } from '../../core/auditoria/auditoria';
import { exigirPermiso, exigirSesion, usuarioEnSesion } from '../../core/auth/permisos';
import { db } from '../../core/db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../../core/db/registro';
import { bsAUsd, usdABs, type Centavos, type Centimos } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { emitir } from '../../core/eventos/bus';
import { esDeCuenta, METODOS_PAGO, type MetodoPago } from '../../core/pagos';
import { obtenerTasaAplicada } from '../../core/tasa/servicio';
import { limpiar, normalizar } from '../../core/util/texto';
import { sesionAbierta } from '../caja/consultas';
import type { Cliente, MovimientoCuenta, TipoMovimientoCuenta } from './tipos';

declare module '../../core/eventos/bus' {
  interface MapaEventos {
    /** Dentro de la transacción: la caja registra la entrada del dinero. */
    'abono.registrado': {
      movimiento: MovimientoCuenta;
      cliente: Cliente;
      sesionCajaId: string;
      metodo: MetodoPago;
      monto: number;
      equivalenteBs: Centimos;
    };
    /** Después de guardar: para que las pantallas se actualicen. */
    'clientes.cambiados': { clienteIds: string[] };
  }
}

export interface DatosCliente {
  nombre: string;
  cedula: string;
  telefono: string;
  limiteCreditoUsd: Centavos | null;
  nota: string;
  activo: boolean;
}

const tablas = () => [db.clientes, db.movimientosCuenta, db.auditoria, db.sesionesCaja, db.movimientosCaja, db.tasas, db.config];

function limpiarDatos(datos: DatosCliente): DatosCliente {
  const limpio = {
    ...datos,
    nombre: limpiar(datos.nombre),
    cedula: datos.cedula.replace(/[\s.]/g, '').toUpperCase(),
    telefono: limpiar(datos.telefono),
    nota: limpiar(datos.nota),
  };
  if (!limpio.nombre) throw new ErrorNegocio('El nombre del cliente es obligatorio.');
  if (limpio.limiteCreditoUsd !== null && (!Number.isSafeInteger(limpio.limiteCreditoUsd) || limpio.limiteCreditoUsd < 0)) {
    throw new ErrorNegocio('El límite de crédito no es válido.');
  }
  return limpio;
}

async function verificarCedula(cedula: string, excluirId: string | null): Promise<void> {
  if (!cedula) return;
  const otro = (await db.clientes.where('cedula').equals(cedula).toArray()).find((c) => vigente(c) && c.id !== excluirId);
  if (otro) throw new ErrorNegocio(`La cédula ${cedula} ya es de «${otro.nombre}».`);
}

export async function crearCliente(datos: DatosCliente): Promise<Cliente> {
  exigirPermiso('clientes.gestionar');
  const limpio = limpiarDatos(datos);
  const cliente = await db.transaction('rw', tablas(), async () => {
    await verificarCedula(limpio.cedula, null);
    const nuevo: Cliente = nuevoRegistro({ ...limpio, nombreNormalizado: normalizar(limpio.nombre), saldoUsd: 0 });
    await db.clientes.add(nuevo);
    await auditar({ entidad: 'cliente', entidadId: nuevo.id, accion: 'crear', despues: limpio });
    return nuevo;
  });
  await emitir('clientes.cambiados', { clienteIds: [cliente.id] });
  return cliente;
}

export async function actualizarCliente(id: string, datos: DatosCliente): Promise<Cliente> {
  exigirPermiso('clientes.gestionar');
  const limpio = limpiarDatos(datos);
  const cliente = await db.transaction('rw', tablas(), async () => {
    const actual = await db.clientes.get(id);
    if (!actual || !vigente(actual)) throw new ErrorNegocio('El cliente no existe.');
    await verificarCedula(limpio.cedula, id);
    const actualizado: Cliente = { ...actual, ...limpio, nombreNormalizado: normalizar(limpio.nombre), ...marcarCambio(actual) };
    await db.clientes.put(actualizado);
    if (actual.limiteCreditoUsd !== limpio.limiteCreditoUsd) {
      await auditar({
        entidad: 'cliente',
        entidadId: id,
        accion: 'cambiar_limite',
        antes: actual.limiteCreditoUsd,
        despues: limpio.limiteCreditoUsd,
      });
    }
    return actualizado;
  });
  await emitir('clientes.cambiados', { clienteIds: [id] });
  return cliente;
}

/**
 * Único punto que cambia el saldo de un cliente: actualiza el saldo y deja el
 * movimiento en su cuenta. Llamar dentro de una transacción que incluya
 * clientes y movimientosCuenta.
 */
export async function aplicarMovimientoCuenta(
  clienteId: string,
  mov: {
    tipo: TipoMovimientoCuenta;
    monto: Centavos;
    descripcion: string;
    metodo?: MetodoPago | null;
    montoOriginal?: number | null;
    tasa?: number | null;
    documentoTipo?: string | null;
    documentoId?: string | null;
  },
): Promise<{ cliente: Cliente; movimiento: MovimientoCuenta }> {
  const cliente = await db.clientes.get(clienteId);
  if (!cliente || !vigente(cliente)) throw new ErrorNegocio('El cliente no existe.');
  if (!Number.isSafeInteger(mov.monto) || mov.monto === 0) throw new ErrorNegocio('El monto del movimiento no es válido.');
  const saldoUsd = cliente.saldoUsd + mov.monto;
  const actualizado: Cliente = { ...cliente, saldoUsd, ...marcarCambio(cliente) };
  const movimiento: MovimientoCuenta = nuevoRegistro({
    clienteId,
    tipo: mov.tipo,
    monto: mov.monto,
    saldoResultante: saldoUsd,
    metodo: mov.metodo ?? null,
    moneda: mov.metodo ? METODOS_PAGO[mov.metodo].moneda : null,
    montoOriginal: mov.montoOriginal ?? null,
    tasa: mov.tasa ?? null,
    documentoTipo: mov.documentoTipo ?? null,
    documentoId: mov.documentoId ?? null,
    descripcion: limpiar(mov.descripcion),
    usuarioId: usuarioEnSesion()?.id ?? null,
  });
  await db.clientes.put(actualizado);
  await db.movimientosCuenta.add(movimiento);
  return { cliente: actualizado, movimiento };
}

/**
 * Abono a la deuda (DISENO.md §6.4): el dinero entra a la caja abierta y un
 * abono en Bs se convierte a USD con la tasa del día.
 */
export async function registrarAbono(datos: { clienteId: string; metodo: MetodoPago; monto: number; nota: string }): Promise<MovimientoCuenta> {
  exigirSesion();
  if (esDeCuenta(datos.metodo)) throw new ErrorNegocio('Un abono se paga con dinero (efectivo, pago móvil, punto…).');
  if (!Number.isSafeInteger(datos.monto) || datos.monto <= 0) throw new ErrorNegocio('El monto del abono debe ser mayor que cero.');
  const resultado = await db.transaction('rw', tablas(), async () => {
    const sesion = await sesionAbierta();
    if (!sesion) throw new ErrorNegocio('La caja está cerrada. Ábrela para recibir el abono.');
    const tasa = await obtenerTasaAplicada();
    if (!tasa) throw new ErrorNegocio('No hay tasa vigente para convertir el abono.');
    const enUsd = METODOS_PAGO[datos.metodo].moneda === 'USD';
    const montoUsd = enUsd ? datos.monto : bsAUsd(datos.monto, tasa.aplicada);
    if (montoUsd <= 0) throw new ErrorNegocio('El abono es demasiado pequeño.');
    const { cliente, movimiento } = await aplicarMovimientoCuenta(datos.clienteId, {
      tipo: 'abono',
      monto: -montoUsd,
      descripcion: datos.nota || 'Abono',
      metodo: datos.metodo,
      montoOriginal: datos.monto,
      tasa: tasa.aplicada,
    });
    await emitir('abono.registrado', {
      movimiento,
      cliente,
      sesionCajaId: sesion.id,
      metodo: datos.metodo,
      monto: datos.monto,
      equivalenteBs: enUsd ? usdABs(datos.monto, tasa.aplicada) : datos.monto,
    });
    return movimiento;
  });
  await emitir('clientes.cambiados', { clienteIds: [datos.clienteId] });
  return resultado;
}

/** Corrección manual de la cuenta (por ejemplo, para cargar deudas viejas del cuaderno). */
export async function registrarAjusteCuenta(datos: { clienteId: string; montoUsd: Centavos; motivo: string }): Promise<MovimientoCuenta> {
  exigirPermiso('clientes.gestionar');
  if (!limpiar(datos.motivo)) throw new ErrorNegocio('Indica el motivo del ajuste.');
  const movimiento = await db.transaction('rw', tablas(), async () => {
    const { movimiento } = await aplicarMovimientoCuenta(datos.clienteId, { tipo: 'ajuste', monto: datos.montoUsd, descripcion: datos.motivo });
    await auditar({ entidad: 'cliente', entidadId: datos.clienteId, accion: 'ajuste_cuenta', despues: { montoUsd: datos.montoUsd, motivo: datos.motivo } });
    return movimiento;
  });
  await emitir('clientes.cambiados', { clienteIds: [datos.clienteId] });
  return movimiento;
}

export async function listarClientes(): Promise<Cliente[]> {
  return (await db.clientes.toArray()).filter(vigente);
}

export async function obtenerClientes(ids: string[]): Promise<Cliente[]> {
  return (await db.clientes.bulkGet(ids)).filter((c): c is Cliente => c !== undefined);
}

export async function movimientosDeCliente(clienteId: string, limite = 100): Promise<MovimientoCuenta[]> {
  return db.movimientosCuenta
    .where('[clienteId+creadoEn]')
    .between([clienteId, ''], [clienteId, '￿'])
    .reverse()
    .limit(limite)
    .toArray();
}
