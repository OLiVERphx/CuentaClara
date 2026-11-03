import { ErrorPermiso } from '../errores';

export type Rol = 'dueno' | 'cajero';

export const NOMBRE_ROL: Record<Rol, string> = { dueno: 'Dueño', cajero: 'Cajero' };

export const PERMISOS = {
  'productos.editar': 'Crear y editar productos y precios',
  'productos.ver_costos': 'Ver costos y márgenes',
  'inventario.ajustar': 'Ajustar el inventario',
  'tasa.editar': 'Cargar la tasa a mano',
  'config.editar': 'Cambiar la configuración del negocio',
  'respaldo.gestionar': 'Crear y restaurar respaldos',
  'usuarios.gestionar': 'Gestionar usuarios',
  'ventas.anular': 'Anular ventas',
  'ventas.devolver': 'Registrar devoluciones',
  'caja.gastos': 'Registrar gastos, retiros e ingresos de caja',
} as const;

export type Permiso = keyof typeof PERMISOS;

/** El cajero vende y consulta; todo lo que cambia precios, costos o datos es del dueño (DISENO.md §7). */
const PERMISOS_POR_ROL: Record<Rol, ReadonlySet<Permiso>> = {
  dueno: new Set(Object.keys(PERMISOS) as Permiso[]),
  cajero: new Set<Permiso>(),
};

export function rolTienePermiso(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS_POR_ROL[rol].has(permiso);
}

// La sesión vive aquí y no en la UI para que los servicios verifiquen permisos
// sin depender de pantallas (la UI solo esconde lo que de todos modos se bloquea).
interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: Rol;
}

let usuarioActual: UsuarioSesion | null = null;

export function iniciarSesion(usuario: UsuarioSesion): void {
  usuarioActual = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
}

export function cerrarSesion(): void {
  usuarioActual = null;
}

export function usuarioEnSesion(): UsuarioSesion | null {
  return usuarioActual;
}

export function tienePermiso(permiso: Permiso): boolean {
  return usuarioActual !== null && rolTienePermiso(usuarioActual.rol, permiso);
}

/** Cualquier usuario con sesión abierta (vender, abrir y cerrar caja). */
export function exigirSesion(): UsuarioSesion {
  if (!usuarioActual) throw new ErrorPermiso('La sesión está cerrada. Ingresa tu PIN.');
  return usuarioActual;
}

export function exigirPermiso(permiso: Permiso): UsuarioSesion {
  if (!usuarioActual) throw new ErrorPermiso('La sesión está cerrada. Ingresa tu PIN.');
  if (!rolTienePermiso(usuarioActual.rol, permiso)) {
    throw new ErrorPermiso(`No tienes permiso para: ${PERMISOS[permiso].toLowerCase()}.`);
  }
  return usuarioActual;
}
