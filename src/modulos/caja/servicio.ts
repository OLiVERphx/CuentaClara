import { auditar } from '../../core/auditoria/auditoria';
import { exigirPermiso, exigirSesion } from '../../core/auth/permisos';
import { db, siguienteNumero } from '../../core/db/db';
import { dispositivoId, marcarCambio, nuevoRegistro } from '../../core/db/registro';
import { usdABs, type Centavos, type Centimos } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { emitir } from '../../core/eventos/bus';
import { esDeCuenta, METODOS_PAGO, type MetodoPago } from '../../core/pagos';
import { uuidv7 } from '../../core/util/id';
import { obtenerTasaAplicada } from '../../core/tasa/servicio';
import { ahoraIso } from '../../core/util/fechas';
import { limpiar } from '../../core/util/texto';
import { resumirCaja } from './calculos';
import { movimientosDeSesion, sesionAbierta } from './consultas';
import type { CategoriaGasto, MovimientoCaja, SesionCaja, TipoMovimientoCaja } from './tipos';

declare module '../../core/eventos/bus' {
  interface MapaEventos {
    /** Después de guardar: para que las pantallas se actualicen. */
    'caja.cambiada': Record<string, never>;
  }
}

const tablas = () => [db.sesionesCaja, db.movimientosCaja, db.gastos, db.contadores, db.auditoria, db.tasas, db.config];

function validarMonto(monto: number, nombre: string, permitirCero = false): void {
  if (!Number.isSafeInteger(monto) || monto < 0 || (!permitirCero && monto === 0)) {
    throw new ErrorNegocio(`${nombre}: monto no válido.`);
  }
}

async function exigirCajaAbierta(): Promise<SesionCaja> {
  const sesion = await sesionAbierta();
  if (!sesion) throw new ErrorNegocio('La caja está cerrada. Ábrela primero.');
  return sesion;
}

export async function abrirCaja(fondo: { fondoBs: Centimos; fondoUsd: Centavos }): Promise<SesionCaja> {
  const usuario = exigirSesion();
  validarMonto(fondo.fondoBs, 'Fondo en Bs', true);
  validarMonto(fondo.fondoUsd, 'Fondo en $', true);
  const sesion = await db.transaction('rw', tablas(), async () => {
    if (await sesionAbierta()) throw new ErrorNegocio('La caja ya está abierta.');
    const nueva: SesionCaja = nuevoRegistro({
      numero: await siguienteNumero('caja'),
      equipoId: dispositivoId(),
      estado: 'abierta' as const,
      abiertaEn: ahoraIso(),
      abiertaPor: usuario.id,
      abiertaPorNombre: usuario.nombre,
      fondoBs: fondo.fondoBs,
      fondoUsd: fondo.fondoUsd,
      cerradaEn: null,
      cerradaPorNombre: null,
      contadoBs: null,
      contadoUsd: null,
      esperadoBs: null,
      esperadoUsd: null,
      nota: '',
    });
    await db.sesionesCaja.add(nueva);
    await auditar({ entidad: 'caja', entidadId: nueva.id, accion: 'abrir', despues: fondo });
    return nueva;
  });
  await emitir('caja.cambiada', {});
  return sesion;
}

/** Cierra la caja con el arqueo del efectivo contado (DISENO.md §6.7). */
export async function cerrarCaja(arqueo: { contadoBs: Centimos; contadoUsd: Centavos; nota: string }): Promise<SesionCaja> {
  const usuario = exigirSesion();
  validarMonto(arqueo.contadoBs, 'Efectivo contado en Bs', true);
  validarMonto(arqueo.contadoUsd, 'Efectivo contado en $', true);
  const sesion = await db.transaction('rw', tablas(), async () => {
    const abierta = await exigirCajaAbierta();
    const resumen = resumirCaja(abierta, await movimientosDeSesion(abierta.id));
    const cerrada: SesionCaja = {
      ...abierta,
      estado: 'cerrada',
      cerradaEn: ahoraIso(),
      cerradaPorNombre: usuario.nombre,
      contadoBs: arqueo.contadoBs,
      contadoUsd: arqueo.contadoUsd,
      esperadoBs: resumen.esperadoBs,
      esperadoUsd: resumen.esperadoUsd,
      nota: limpiar(arqueo.nota),
      ...marcarCambio(abierta),
    };
    await db.sesionesCaja.put(cerrada);
    await auditar({
      entidad: 'caja',
      entidadId: cerrada.id,
      accion: 'cerrar',
      despues: {
        esperadoBs: resumen.esperadoBs,
        contadoBs: arqueo.contadoBs,
        esperadoUsd: resumen.esperadoUsd,
        contadoUsd: arqueo.contadoUsd,
      },
    });
    return cerrada;
  });
  await emitir('caja.cambiada', {});
  return sesion;
}

async function equivalenteEnBs(monto: number, metodo: MetodoPago): Promise<Centimos> {
  if (METODOS_PAGO[metodo].moneda === 'VES') return monto;
  const tasa = await obtenerTasaAplicada();
  return tasa ? usdABs(monto, tasa.aplicada) : 0;
}

async function agregarMovimiento(
  sesion: SesionCaja,
  datos: { tipo: TipoMovimientoCaja; metodo: MetodoPago; monto: number; descripcion: string; documentoTipo?: string; documentoId?: string },
): Promise<MovimientoCaja> {
  const usuario = exigirSesion();
  const movimiento: MovimientoCaja = nuevoRegistro({
    sesionCajaId: sesion.id,
    tipo: datos.tipo,
    metodo: datos.metodo,
    moneda: METODOS_PAGO[datos.metodo].moneda,
    monto: datos.monto,
    equivalenteBs: await equivalenteEnBs(datos.monto, datos.metodo),
    documentoTipo: datos.documentoTipo ?? null,
    documentoId: datos.documentoId ?? null,
    descripcion: datos.descripcion,
    usuarioId: usuario.id,
  });
  await db.movimientosCaja.add(movimiento);
  return movimiento;
}

/** Retiro del dueño o ingreso extra (por ejemplo, sencillo que se agrega a la gaveta). */
export async function registrarMovimientoManual(datos: {
  tipo: 'retiro_dueno' | 'ingreso_extra';
  metodo: MetodoPago;
  monto: number;
  descripcion: string;
}): Promise<MovimientoCaja> {
  exigirPermiso('caja.gastos');
  validarMonto(datos.monto, 'Monto');
  const movimiento = await db.transaction('rw', tablas(), async () => {
    const sesion = await exigirCajaAbierta();
    const signo = datos.tipo === 'retiro_dueno' ? -1 : 1;
    const m = await agregarMovimiento(sesion, {
      tipo: datos.tipo,
      metodo: datos.metodo,
      monto: signo * datos.monto,
      descripcion: limpiar(datos.descripcion),
    });
    await auditar({ entidad: 'caja', entidadId: m.id, accion: datos.tipo, despues: { metodo: datos.metodo, monto: datos.monto } });
    return m;
  });
  await emitir('caja.cambiada', {});
  return movimiento;
}

/**
 * Cambio de efectivo: el cliente paga con un método sin efectivo (transferencia,
 * pago móvil, punto, biopago…) y se lleva efectivo. La gaveta baja lo entregado y
 * el método recibe lo cobrado; la diferencia, valuada en Bs, es la comisión.
 */
export async function registrarCambioEfectivo(datos: {
  metodoRecibido: MetodoPago;
  montoRecibido: number;
  metodoEntregado: MetodoPago;
  montoEntregado: number;
  nota: string;
}): Promise<{ comisionBs: Centimos }> {
  exigirSesion();
  validarMonto(datos.montoRecibido, 'Monto recibido');
  validarMonto(datos.montoEntregado, 'Monto entregado');
  if (!METODOS_PAGO[datos.metodoEntregado].efectivo) throw new ErrorNegocio('Lo que entregas tiene que ser efectivo.');
  if (esDeCuenta(datos.metodoRecibido)) throw new ErrorNegocio('El cliente tiene que pagar con dinero, no con fiado.');
  if (datos.metodoRecibido === datos.metodoEntregado) throw new ErrorNegocio('Elige métodos distintos para recibir y entregar.');
  const resultado = await db.transaction('rw', tablas(), async () => {
    const sesion = await exigirCajaAbierta();
    const id = uuidv7();
    const base = { tipo: 'cambio_efectivo' as const, descripcion: limpiar(datos.nota) || 'Cambio de efectivo', documentoTipo: 'cambio', documentoId: id };
    const entra = await agregarMovimiento(sesion, { ...base, metodo: datos.metodoRecibido, monto: datos.montoRecibido });
    const sale = await agregarMovimiento(sesion, { ...base, metodo: datos.metodoEntregado, monto: -datos.montoEntregado });
    const comisionBs = entra.equivalenteBs + sale.equivalenteBs;
    await auditar({ entidad: 'caja', entidadId: id, accion: 'cambio_efectivo', despues: { ...datos, comisionBs } });
    return { comisionBs };
  });
  await emitir('caja.cambiada', {});
  return resultado;
}

export async function registrarGasto(datos: {
  categoria: CategoriaGasto;
  descripcion: string;
  metodo: MetodoPago;
  monto: number;
  desdeCaja: boolean;
}): Promise<void> {
  const usuario = exigirPermiso('caja.gastos');
  validarMonto(datos.monto, 'Monto del gasto');
  if (!limpiar(datos.descripcion)) throw new ErrorNegocio('Describe el gasto.');
  await db.transaction('rw', tablas(), async () => {
    const sesion = datos.desdeCaja ? await exigirCajaAbierta() : await sesionAbierta();
    const gasto = nuevoRegistro({
      categoria: datos.categoria,
      descripcion: limpiar(datos.descripcion),
      metodo: datos.metodo,
      moneda: METODOS_PAGO[datos.metodo].moneda,
      monto: datos.monto,
      desdeCaja: datos.desdeCaja,
      sesionCajaId: sesion?.id ?? null,
      usuarioId: usuario.id,
    });
    await db.gastos.add(gasto);
    if (datos.desdeCaja && sesion) {
      await agregarMovimiento(sesion, {
        tipo: 'gasto',
        metodo: datos.metodo,
        monto: -datos.monto,
        descripcion: gasto.descripcion,
        documentoTipo: 'gasto',
        documentoId: gasto.id,
      });
    }
    await auditar({ entidad: 'gasto', entidadId: gasto.id, accion: 'registrar', despues: datos });
  });
  await emitir('caja.cambiada', {});
}
