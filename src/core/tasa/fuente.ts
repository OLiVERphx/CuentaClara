import { ESCALA, parsearDecimal, type Tasa4 } from '../dinero/dinero';
import { ErrorNegocio } from '../errores';
import { esFechaValida } from '../util/fechas';

/**
 * Fuente automática de la tasa oficial (DISENO.md §6.2).
 * DolarApi publica la tasa del BCV con su fecha valor y permite consultas
 * directas desde el navegador. Si deja de funcionar, se reemplaza aquí sin
 * tocar el resto del sistema; la carga manual siempre queda disponible.
 */
export const URL_TASA_OFICIAL = 'https://ve.dolarapi.com/v1/dolares/oficial';

export interface TasaConsultada {
  fechaValor: string;
  valor: Tasa4;
}

export function interpretarRespuesta(json: unknown): TasaConsultada {
  const datos = json as { promedio?: unknown; venta?: unknown; fechaActualizacion?: unknown };
  const numero = typeof datos?.promedio === 'number' ? datos.promedio : datos?.venta;
  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero <= 0) {
    throw new ErrorNegocio('La fuente de la tasa respondió sin un valor válido.');
  }
  // String(889.5754) es exacto ("889.5754"); se evita multiplicar el flotante.
  const valor = parsearDecimal(String(numero), ESCALA.tasa);
  const fechaValor = typeof datos.fechaActualizacion === 'string' ? datos.fechaActualizacion.slice(0, 10) : '';
  if (valor === null || valor <= 0) throw new ErrorNegocio('La fuente de la tasa respondió sin un valor válido.');
  if (!esFechaValida(fechaValor)) throw new ErrorNegocio('La fuente de la tasa respondió sin fecha valor.');
  return { fechaValor, valor };
}

export async function consultarTasaOficial(fetchFn: typeof fetch = fetch, msLimite = 10_000): Promise<TasaConsultada> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), msLimite);
  try {
    const respuesta = await fetchFn(URL_TASA_OFICIAL, { signal: control.signal, cache: 'no-store' });
    if (!respuesta.ok) throw new ErrorNegocio(`La fuente de la tasa no respondió (código ${respuesta.status}).`);
    return interpretarRespuesta(await respuesta.json());
  } catch (error) {
    if (error instanceof ErrorNegocio) throw error;
    throw new ErrorNegocio('No se pudo consultar la tasa. Revisa la conexión o cárgala a mano.');
  } finally {
    clearTimeout(temporizador);
  }
}
