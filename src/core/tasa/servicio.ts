import { auditar } from '../auditoria/auditoria';
import { exigirPermiso } from '../auth/permisos';
import type { Tasa4 } from '../dinero/dinero';
import { db } from '../db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../db/registro';
import type { Tasa } from '../db/tipos';
import { ErrorNegocio } from '../errores';
import { emitir } from '../eventos/bus';
import { esFechaValida, hoyLocal } from '../util/fechas';
import { consultarTasaOficial } from './fuente';
import { elegirProxima, elegirVigente } from './logica';

declare module '../eventos/bus' {
  interface MapaEventos {
    'tasa.actualizada': { tasa: Tasa };
  }
}

const CLAVE_ULTIMA_CONSULTA = 'ultimaConsultaTasa';

export async function obtenerTasas(): Promise<Tasa[]> {
  return (await db.tasas.toArray()).filter(vigente);
}

export async function obtenerTasaVigente(hoy = hoyLocal()): Promise<Tasa | null> {
  return elegirVigente(await obtenerTasas(), hoy);
}

export async function obtenerTasaProxima(hoy = hoyLocal()): Promise<Tasa | null> {
  return elegirProxima(await obtenerTasas(), hoy);
}

export async function historialTasas(limite = 60): Promise<Tasa[]> {
  return (await db.tasas.orderBy('fechaValor').reverse().limit(limite).toArray()).filter(vigente);
}

function validar(fechaValor: string, valor: Tasa4): void {
  if (!esFechaValida(fechaValor)) throw new ErrorNegocio('La fecha valor no es válida.');
  if (!Number.isSafeInteger(valor) || valor <= 0) throw new ErrorNegocio('La tasa debe ser mayor que cero.');
}

/** Carga manual: siempre manda sobre la automática de la misma fecha valor. */
export async function registrarTasaManual(fechaValor: string, valor: Tasa4): Promise<Tasa> {
  const usuario = exigirPermiso('tasa.editar');
  validar(fechaValor, valor);
  const tasa = await db.transaction('rw', db.tasas, db.auditoria, async () => {
    const existente = await db.tasas.where('fechaValor').equals(fechaValor).first();
    let resultado: Tasa;
    if (existente) {
      resultado = { ...existente, valor, fuente: 'manual', usuarioId: usuario.id, eliminadoEn: null, ...marcarCambio(existente) };
      await db.tasas.put(resultado);
    } else {
      resultado = nuevoRegistro({ fechaValor, valor, fuente: 'manual' as const, usuarioId: usuario.id });
      await db.tasas.add(resultado);
    }
    await auditar({
      entidad: 'tasa',
      entidadId: resultado.id,
      accion: 'carga_manual',
      antes: existente ? { valor: existente.valor, fuente: existente.fuente } : null,
      despues: { fechaValor, valor },
    });
    return resultado;
  });
  await emitir('tasa.actualizada', { tasa });
  return tasa;
}

/**
 * Guarda una tasa obtenida automáticamente. No pisa una carga manual de la
 * misma fecha valor. Devuelve la tasa guardada o `null` si no hubo cambios.
 */
export async function guardarTasaAutomatica(fechaValor: string, valor: Tasa4): Promise<Tasa | null> {
  validar(fechaValor, valor);
  const tasa = await db.transaction('rw', db.tasas, async () => {
    const existente = await db.tasas.where('fechaValor').equals(fechaValor).first();
    if (existente && vigente(existente) && (existente.fuente === 'manual' || existente.valor === valor)) return null;
    if (existente) {
      const actualizada: Tasa = { ...existente, valor, fuente: 'auto', usuarioId: null, eliminadoEn: null, ...marcarCambio(existente) };
      await db.tasas.put(actualizada);
      return actualizada;
    }
    const nueva = nuevoRegistro({ fechaValor, valor, fuente: 'auto' as const, usuarioId: null });
    await db.tasas.add(nueva);
    return nueva;
  });
  if (tasa) await emitir('tasa.actualizada', { tasa });
  return tasa;
}

export async function actualizarTasaAutomatica(fetchFn?: typeof fetch): Promise<Tasa | null> {
  const consultada = await consultarTasaOficial(fetchFn);
  const tasa = await guardarTasaAutomatica(consultada.fechaValor, consultada.valor);
  await db.config.put({ clave: CLAVE_ULTIMA_CONSULTA, valor: Date.now() });
  return tasa;
}

/** Momento de la última consulta automática exitosa (ms desde 1970) o 0. */
export async function ultimaConsultaTasa(): Promise<number> {
  const entrada = await db.config.get(CLAVE_ULTIMA_CONSULTA);
  return typeof entrada?.valor === 'number' ? entrada.valor : 0;
}
