import { exigirPermiso } from '../auth/permisos';
import { db } from '../db/db';
import { ErrorNegocio } from '../errores';
import { ahoraIso, hoyLocal } from '../util/fechas';
import { cifrarRespaldo, EXTENSION_RESPALDO, LARGO_MINIMO_CONTRASENA } from './respaldo';

/**
 * Respaldo automático al cerrar la caja (D20). Si el navegador permite elegir
 * una carpeta (Chrome/Edge en computadora), el archivo se guarda solo ahí,
 * por ejemplo en un pendrive. Si no, se descarga.
 *
 * La contraseña queda guardada en este equipo para poder cifrar sin
 * preguntar. Protege la copia que sale del equipo (el pendrive), no el equipo
 * en sí; por eso nunca viaja dentro de un respaldo.
 */

const CLAVE = 'respaldoAuto';

/** Lo mínimo de la API de carpetas que usamos (aún no está en los tipos estándar de TypeScript). */
export interface Carpeta {
  name: string;
  queryPermission?(opciones: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opciones: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(nombre: string, opciones: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(datos: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

export interface ConfigRespaldoAuto {
  activo: boolean;
  contrasena: string;
  carpeta: Carpeta | null;
  ultimo: string | null;
}

export type ResultadoRespaldo =
  | { estado: 'desactivado' }
  | { estado: 'guardado'; nombre: string; carpeta: string }
  | { estado: 'descargar'; nombre: string; archivo: Blob }
  | { estado: 'error'; mensaje: string };

export async function leerRespaldoAuto(): Promise<ConfigRespaldoAuto> {
  const entrada = await db.config.get(CLAVE);
  return { activo: false, contrasena: '', carpeta: null, ultimo: null, ...(entrada?.valor as Partial<ConfigRespaldoAuto> | undefined) };
}

export async function configurarRespaldoAuto(cambios: Partial<Omit<ConfigRespaldoAuto, 'ultimo'>>): Promise<ConfigRespaldoAuto> {
  exigirPermiso('respaldo.gestionar');
  const actual = await leerRespaldoAuto();
  const nueva = { ...actual, ...cambios };
  if (nueva.activo && nueva.contrasena.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorNegocio(`La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
  }
  await db.config.put({ clave: CLAVE, valor: nueva });
  return nueva;
}

export function puedeElegirCarpeta(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Pide (si hace falta) permiso para escribir en la carpeta. Hay que llamarla
 * apenas el usuario hace clic, antes de otras esperas: el navegador solo
 * muestra el permiso como respuesta directa a un clic.
 */
export async function prepararPermiso(): Promise<void> {
  const cfg = await leerRespaldoAuto();
  if (!cfg.activo || !cfg.carpeta?.queryPermission) return;
  if ((await cfg.carpeta.queryPermission({ mode: 'readwrite' })) === 'prompt') {
    await cfg.carpeta.requestPermission?.({ mode: 'readwrite' }).catch(() => undefined);
  }
}

export function nombreArchivo(fecha = new Date()): string {
  const hora = `${String(fecha.getHours()).padStart(2, '0')}${String(fecha.getMinutes()).padStart(2, '0')}`;
  return `respaldo-bodega-${hoyLocal(fecha)}-${hora}${EXTENSION_RESPALDO}`;
}

/** `carpeta` reemplaza la guardada (lo usan las pruebas, que no pueden guardar una carpeta real). */
export async function ejecutarRespaldoAutomatico(opciones: { carpeta?: Carpeta | null } = {}): Promise<ResultadoRespaldo> {
  const cfg = await leerRespaldoAuto();
  if (!cfg.activo) return { estado: 'desactivado' };
  const carpeta = opciones.carpeta !== undefined ? opciones.carpeta : cfg.carpeta;
  try {
    const archivo = await cifrarRespaldo(cfg.contrasena);
    const nombre = nombreArchivo();
    let resultado: ResultadoRespaldo = { estado: 'descargar', nombre, archivo };
    if (carpeta) {
      const permiso = carpeta.queryPermission ? await carpeta.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (permiso === 'granted') {
        const destino = await (await carpeta.getFileHandle(nombre, { create: true })).createWritable();
        await destino.write(archivo);
        await destino.close();
        resultado = { estado: 'guardado', nombre, carpeta: carpeta.name };
      }
    }
    await db.config.put({ clave: CLAVE, valor: { ...cfg, ultimo: ahoraIso() } });
    return resultado;
  } catch (error) {
    console.error(error);
    return { estado: 'error', mensaje: 'No se pudo crear el respaldo automático. Hazlo a mano desde Configuración → Respaldos.' };
  }
}
