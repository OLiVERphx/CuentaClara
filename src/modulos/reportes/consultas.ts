import { db } from '../../core/db/db';
import { vigente } from '../../core/db/registro';
import { sumarDias } from '../../core/util/fechas';
import type { VentaItem } from '../ventas/tipos';
import type { DatosPeriodo } from './calculos';

/** Carga todo lo necesario para los reportes de un período de días locales, solo leyendo. */
export async function cargarPeriodo(desde: string, hasta: string): Promise<DatosPeriodo> {
  const inicio = new Date(`${desde}T00:00:00`).toISOString();
  const fin = new Date(`${sumarDias(hasta, 1)}T00:00:00`).toISOString();

  const [ventas, devoluciones, gastos, tasas] = await Promise.all([
    db.ventas.where('creadoEn').between(inicio, fin, true, false).toArray(),
    db.devoluciones.where('creadoEn').between(inicio, fin, true, false).toArray(),
    db.gastos.where('creadoEn').between(inicio, fin, true, false).toArray(),
    db.tasas.toArray(),
  ]);
  const ids = ventas.map((v) => v.id);
  const [items, pagos, devolucionItems] = await Promise.all([
    db.ventaItems.where('ventaId').anyOf(ids).toArray(),
    db.pagos.where('ventaId').anyOf(ids).toArray(),
    db.devolucionItems.where('devolucionId').anyOf(devoluciones.map((d) => d.id)).toArray(),
  ]);
  const itemsDevueltos = (await db.ventaItems.bulkGet(devolucionItems.map((d) => d.ventaItemId))).filter(
    (i): i is VentaItem => i !== undefined,
  );
  return {
    ventas,
    items,
    pagos,
    devoluciones,
    devolucionItems,
    itemsDevueltos,
    gastos: gastos.filter(vigente),
    tasas: tasas.filter(vigente),
  };
}
