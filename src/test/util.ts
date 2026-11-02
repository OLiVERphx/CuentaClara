import { cerrarSesion, iniciarSesion, type Rol } from '../core/auth/permisos';
import { db } from '../core/db/db';
import { limpiarOyentes } from '../core/eventos/bus';

/** Deja la base vacía, sin sesión y sin oyentes. */
export async function reiniciarBase(): Promise<void> {
  cerrarSesion();
  limpiarOyentes();
  await db.delete();
  await db.open();
}

export function sesionDePrueba(rol: Rol = 'dueno'): void {
  iniciarSesion({ id: `usuario-${rol}`, nombre: `Prueba ${rol}`, rol });
}
