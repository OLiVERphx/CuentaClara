import { auditar } from '../auditoria/auditoria';
import { db } from '../db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../db/registro';
import type { Usuario } from '../db/tipos';
import { ErrorNegocio } from '../errores';
import { limpiar } from '../util/texto';
import { exigirPermiso, iniciarSesion, type Rol } from './permisos';
import { crearCredencial, pinValido, verificarPin } from './pin';

const CLAVE_BLOQUEO = 'bloqueoPin';
const INTENTOS_LIBRES = 5;
const ESPERA_INICIAL_MS = 30_000;
const ESPERA_MAXIMA_MS = 15 * 60_000;

interface EstadoBloqueo {
  intentosFallidos: number;
  bloqueadoHasta: number;
}

export async function listarUsuariosActivos(): Promise<Usuario[]> {
  const todos = await db.usuarios.toArray();
  return todos.filter((u) => vigente(u) && u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function hayUsuarios(): Promise<boolean> {
  return (await db.usuarios.count()) > 0;
}

/**
 * Crea un usuario. Sin usuarios previos solo se permite crear al dueño
 * (asistente de primer uso); después hace falta el permiso correspondiente.
 */
export async function crearUsuario(datos: { nombre: string; rol: Rol; pin: string }): Promise<Usuario> {
  const nombre = limpiar(datos.nombre);
  if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
  if (!pinValido(datos.pin)) throw new ErrorNegocio('El PIN debe tener entre 4 y 6 dígitos.');
  const credencial = await crearCredencial(datos.pin);

  return db.transaction('rw', db.usuarios, db.auditoria, async () => {
    if (await hayUsuarios()) {
      exigirPermiso('usuarios.gestionar');
    } else if (datos.rol !== 'dueno') {
      throw new ErrorNegocio('El primer usuario debe ser el dueño.');
    }
    const usuario = nuevoRegistro({ nombre, rol: datos.rol, activo: true, ...credencial });
    await db.usuarios.add(usuario);
    await auditar({ entidad: 'usuario', entidadId: usuario.id, accion: 'crear', despues: { nombre, rol: datos.rol } });
    return usuario;
  });
}

async function leerBloqueo(): Promise<EstadoBloqueo> {
  const entrada = await db.config.get(CLAVE_BLOQUEO);
  return (entrada?.valor as EstadoBloqueo | undefined) ?? { intentosFallidos: 0, bloqueadoHasta: 0 };
}

/** Milisegundos que faltan para poder intentar de nuevo (0 si no hay bloqueo). */
export async function esperaPorBloqueo(ahora = Date.now()): Promise<number> {
  const bloqueo = await leerBloqueo();
  return Math.max(0, bloqueo.bloqueadoHasta - ahora);
}

export type ResultadoIngreso =
  | { ok: true; usuario: Usuario }
  | { ok: false; esperaMs: number; intentosRestantes: number };

/**
 * Verifica el PIN y abre la sesión. Tras 5 fallos seguidos bloquea 30 s, y
 * cada fallo adicional duplica la espera (máximo 15 min). El estado se guarda
 * en la base para que recargar la página no lo reinicie.
 */
export async function ingresar(usuarioId: string, pin: string, ahora = Date.now()): Promise<ResultadoIngreso> {
  const bloqueo = await leerBloqueo();
  if (bloqueo.bloqueadoHasta > ahora) {
    return { ok: false, esperaMs: bloqueo.bloqueadoHasta - ahora, intentosRestantes: 0 };
  }
  const usuario = await db.usuarios.get(usuarioId);
  const correcto = usuario && vigente(usuario) && usuario.activo && (await verificarPin(pin, usuario));

  if (correcto) {
    await db.config.put({ clave: CLAVE_BLOQUEO, valor: { intentosFallidos: 0, bloqueadoHasta: 0 } });
    iniciarSesion(usuario);
    return { ok: true, usuario };
  }

  const intentosFallidos = bloqueo.intentosFallidos + 1;
  const exceso = intentosFallidos - INTENTOS_LIBRES;
  const espera = exceso >= 0 ? Math.min(ESPERA_INICIAL_MS * 2 ** exceso, ESPERA_MAXIMA_MS) : 0;
  await db.config.put({ clave: CLAVE_BLOQUEO, valor: { intentosFallidos, bloqueadoHasta: espera ? ahora + espera : 0 } });
  return { ok: false, esperaMs: espera, intentosRestantes: Math.max(0, INTENTOS_LIBRES - intentosFallidos) };
}

export async function cambiarPin(usuarioId: string, pinActual: string, pinNuevo: string): Promise<void> {
  if (!pinValido(pinNuevo)) throw new ErrorNegocio('El PIN nuevo debe tener entre 4 y 6 dígitos.');
  const usuario = await db.usuarios.get(usuarioId);
  if (!usuario || !(await verificarPin(pinActual, usuario))) throw new ErrorNegocio('El PIN actual no es correcto.');
  const credencial = await crearCredencial(pinNuevo);
  await db.transaction('rw', db.usuarios, db.auditoria, async () => {
    await db.usuarios.update(usuarioId, { ...credencial, ...marcarCambio(usuario) });
    await auditar({ entidad: 'usuario', entidadId: usuarioId, accion: 'cambiar_pin' });
  });
}
