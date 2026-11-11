import { exigirPermiso } from '../auth/permisos';
import { hayUsuarios } from '../auth/usuarios';
import { CLAVES_LOCALES, guardarDispositivo } from '../config/config';
import { db } from '../db/db';
import { dispositivoId } from '../db/registro';
import type { EntradaConfig } from '../db/tipos';
import { ErrorNegocio } from '../errores';
import { emitir } from '../eventos/bus';
import { bytesAleatorios } from '../util/bytes';
import { ahoraIso } from '../util/fechas';
import { uuidv7 } from '../util/id';

declare module '../eventos/bus' {
  interface MapaEventos {
    'datos.restaurados': Record<string, never>;
  }
}

/**
 * Formato del archivo .bodega (DISENO.md §7, D20):
 *   "BDG1" | sal (16 bytes) | iv (12 bytes) | AES-256-GCM( gzip( JSON ) )
 * La clave sale de la contraseña con PBKDF2-SHA256. A diferencia del PIN, aquí
 * la contraseña sí puede ser fuerte, así que se usan muchas iteraciones.
 */
const MAGIA = new TextEncoder().encode('BDG1');
const ITERACIONES = 600_000;
const LARGO_SAL = 16;
const LARGO_IV = 12;
export const EXTENSION_RESPALDO = '.bodega';
export const LARGO_MINIMO_CONTRASENA = 8;

export interface ContenidoRespaldo {
  formato: 'bodega-respaldo';
  version: 1;
  esquema: number;
  creadoEn: string;
  dispositivoId: string;
  datos: Record<string, unknown[]>;
}

async function derivarClave(contrasena: string, sal: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function transformar(bytes: Uint8Array<ArrayBuffer>, flujo: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const salida = new Blob([bytes]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

export async function exportarContenido(): Promise<ContenidoRespaldo> {
  const datos: Record<string, unknown[]> = {};
  // Una sola transacción de lectura: la foto es consistente aunque se esté usando la app.
  await db.transaction('r', db.tables, async () => {
    for (const tabla of db.tables) datos[tabla.name] = await tabla.toArray();
  });
  // Lo propio de este equipo (y la contraseña de los respaldos automáticos) nunca sale en un respaldo.
  datos.config = (datos.config as EntradaConfig[]).filter((e) => !CLAVES_LOCALES.has(e.clave));
  return { formato: 'bodega-respaldo', version: 1, esquema: db.verno, creadoEn: ahoraIso(), dispositivoId: dispositivoId(), datos };
}

export async function crearRespaldo(contrasena: string): Promise<Blob> {
  exigirPermiso('respaldo.gestionar');
  return cifrarRespaldo(contrasena);
}

/**
 * Arma y cifra el archivo de respaldo, sin verificar permisos. Solo para el
 * respaldo automático, que el dueño configura y corre al cerrar la caja.
 */
export async function cifrarRespaldo(contrasena: string): Promise<Blob> {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorNegocio(`La contraseña del respaldo debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
  }
  const contenido = await exportarContenido();
  const comprimido = await transformar(new TextEncoder().encode(JSON.stringify(contenido)), new CompressionStream('gzip'));
  const sal = bytesAleatorios(LARGO_SAL);
  const iv = bytesAleatorios(LARGO_IV);
  const clave = await derivarClave(contrasena, sal);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, comprimido));
  return new Blob([MAGIA, sal, iv, cifrado], { type: 'application/octet-stream' });
}

export async function leerRespaldo(archivo: Blob, contrasena: string): Promise<ContenidoRespaldo> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const cabecera = MAGIA.length + LARGO_SAL + LARGO_IV;
  if (bytes.length <= cabecera || !MAGIA.every((b, i) => bytes[i] === b)) {
    throw new ErrorNegocio('El archivo no es un respaldo de este sistema.');
  }
  const sal = bytes.slice(MAGIA.length, MAGIA.length + LARGO_SAL);
  const iv = bytes.slice(MAGIA.length + LARGO_SAL, cabecera);
  let json: string;
  try {
    const clave = await derivarClave(contrasena, sal);
    const comprimido = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, bytes.slice(cabecera)));
    json = new TextDecoder().decode(await transformar(comprimido, new DecompressionStream('gzip')));
  } catch {
    throw new ErrorNegocio('Contraseña incorrecta o archivo dañado.');
  }
  const contenido = JSON.parse(json) as ContenidoRespaldo;
  if (contenido?.formato !== 'bodega-respaldo' || typeof contenido.datos !== 'object') {
    throw new ErrorNegocio('El archivo no tiene el formato esperado.');
  }
  if (contenido.esquema > db.verno) {
    throw new ErrorNegocio('El respaldo es de una versión más nueva del sistema. Actualiza la app antes de restaurarlo.');
  }
  return contenido;
}

export function resumirRespaldo(contenido: ContenidoRespaldo): Record<string, number> {
  return Object.fromEntries(Object.entries(contenido.datos).map(([tabla, filas]) => [tabla, filas.length]));
}

/**
 * Reemplaza todos los datos por los del respaldo, en una sola transacción.
 * Conserva la identidad de este equipo (prefijo, bloqueo de PIN).
 */
export async function restaurarRespaldo(contenido: ContenidoRespaldo): Promise<void> {
  exigirPermiso('respaldo.gestionar');
  await reemplazarDatos(contenido);
  await emitir('datos.restaurados', {});
}

/**
 * Prefijos de numeración que ya usó algún equipo en este respaldo (L-000123,
 * L-C00012…). Un equipo nuevo no puede repetirlos.
 */
export function prefijosUsados(contenido: ContenidoRespaldo): Set<string> {
  const usados = new Set<string>();
  for (const tabla of ['ventas', 'compras', 'devoluciones']) {
    for (const fila of contenido.datos[tabla] ?? []) {
      const m = /^([A-Z]{1,2})-/.exec((fila as { numero?: unknown }).numero as string);
      if (m) usados.add(m[1]!);
    }
  }
  return usados;
}

/**
 * Primer arranque en un equipo nuevo (por ejemplo, el teléfono): carga la
 * bodega de otro equipo desde su respaldo y le da a este equipo su propio
 * nombre y prefijo. Solo se permite mientras este equipo no tenga usuarios,
 * así no sirve para saltarse el PIN de una bodega ya configurada.
 */
export async function restaurarEnEquipoNuevo(contenido: ContenidoRespaldo, equipo: { nombre: string; prefijo: string }): Promise<void> {
  if (await hayUsuarios()) throw new ErrorNegocio('Este equipo ya tiene una bodega. Restaura desde Configuración → Respaldo.');
  const prefijo = equipo.prefijo.trim().toUpperCase();
  if (prefijosUsados(contenido).has(prefijo)) {
    throw new ErrorNegocio(`El prefijo ${prefijo} ya lo usa otro equipo de esta bodega. Elige otro (por ejemplo T).`);
  }
  if (!(contenido.datos.usuarios ?? []).length) throw new ErrorNegocio('El respaldo no trae usuarios; no se podría entrar.');
  await db.transaction('rw', db.tables, async () => {
    await reemplazarDatos(contenido);
    await guardarDispositivo({ id: uuidv7(), nombre: equipo.nombre.trim() || 'Teléfono', prefijo });
  });
}

/** Reemplaza todos los datos por los del respaldo, conservando lo propio de este equipo. */
async function reemplazarDatos(contenido: ContenidoRespaldo): Promise<void> {
  const nombres = new Set(db.tables.map((t) => t.name));
  for (const tabla of Object.keys(contenido.datos)) {
    if (!nombres.has(tabla)) throw new ErrorNegocio(`El respaldo trae una tabla desconocida: ${tabla}.`);
  }
  await db.transaction('rw', db.tables, async () => {
    const locales = (await db.config.toArray()).filter((e) => CLAVES_LOCALES.has(e.clave));
    for (const tabla of db.tables) {
      await tabla.clear();
      const filas = contenido.datos[tabla.name] ?? [];
      if (tabla.name === 'config') {
        const entradas = (filas as EntradaConfig[]).filter((e) => !CLAVES_LOCALES.has(e.clave));
        await tabla.bulkAdd([...entradas, ...locales]);
      } else {
        await tabla.bulkAdd(filas);
      }
    }
  });
}
