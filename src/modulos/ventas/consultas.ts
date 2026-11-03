import { db } from '../../core/db/db';
import type { Milesimas } from '../../core/dinero/dinero';
import { sumarDias } from '../../core/util/fechas';

/**
 * Consultas de solo lectura de ventas que usan otros módulos (por ejemplo,
 * inventario para sugerir la reposición).
 */

/** Unidades base vendidas por producto en los últimos `dias` días (sin anuladas, menos devoluciones). */
export async function vendidoPorProducto(hoy: string, dias: number): Promise<Map<string, Milesimas>> {
  const desde = new Date(`${sumarDias(hoy, -(dias - 1))}T00:00:00`).toISOString();
  const ventas = (await db.ventas.where('creadoEn').aboveOrEqual(desde).toArray()).filter((v) => v.estado === 'completada');
  const ids = ventas.map((v) => v.id);
  const [items, devueltos] = await Promise.all([
    db.ventaItems.where('ventaId').anyOf(ids).toArray(),
    db.devolucionItems.where('ventaId').anyOf(ids).toArray(),
  ]);
  const vendido = new Map<string, Milesimas>();
  for (const i of items) vendido.set(i.productoId, (vendido.get(i.productoId) ?? 0) + i.cantidadBase);
  for (const d of devueltos) vendido.set(d.productoId, (vendido.get(d.productoId) ?? 0) - d.cantidadBase);
  return vendido;
}
