import { usuarioEnSesion } from '../auth/permisos';
import { db } from '../db/db';
import { dispositivoId } from '../db/registro';
import { ahoraIso } from '../util/fechas';
import { uuidv7 } from '../util/id';

/**
 * Deja constancia de una acción sensible (DISENO.md §7). Llamar dentro de la
 * misma transacción que hace el cambio para que ambos queden o ninguno.
 */
export async function auditar(entrada: {
  entidad: string;
  entidadId: string;
  accion: string;
  antes?: unknown;
  despues?: unknown;
}): Promise<void> {
  const usuario = usuarioEnSesion();
  await db.auditoria.add({
    id: uuidv7(),
    creadoEn: ahoraIso(),
    dispositivoId: dispositivoId(),
    usuarioId: usuario?.id ?? null,
    usuarioNombre: usuario?.nombre ?? null,
    entidad: entrada.entidad,
    entidadId: entrada.entidadId,
    accion: entrada.accion,
    antes: entrada.antes ?? null,
    despues: entrada.despues ?? null,
  });
}

export async function listarAuditoria(limite = 100) {
  return db.auditoria.orderBy('creadoEn').reverse().limit(limite).toArray();
}
