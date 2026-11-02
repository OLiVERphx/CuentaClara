/**
 * Bus de eventos entre módulos (DISENO.md §3.3–3.4).
 *
 * Los módulos no se importan entre sí: publican y escuchan eventos.
 * Cada módulo declara sus eventos ampliando `MapaEventos`:
 *
 *   declare module '../../core/eventos/bus' {
 *     interface MapaEventos { 'venta.registrada': { ventaId: string } }
 *   }
 *
 * Los oyentes se ejecutan en orden y se esperan. Si un oyente escribe en la
 * base de datos, el emisor debe emitir dentro de su transacción para que todo
 * se guarde o nada se guarde.
 */
export interface MapaEventos {}

type Oyente<K extends keyof MapaEventos> = (datos: MapaEventos[K]) => void | Promise<void>;

const oyentes = new Map<keyof MapaEventos, Set<Oyente<never>>>();

export function suscribir<K extends keyof MapaEventos>(evento: K, oyente: Oyente<K>): () => void {
  let conjunto = oyentes.get(evento);
  if (!conjunto) {
    conjunto = new Set();
    oyentes.set(evento, conjunto);
  }
  conjunto.add(oyente as Oyente<never>);
  return () => conjunto.delete(oyente as Oyente<never>);
}

export async function emitir<K extends keyof MapaEventos>(evento: K, datos: MapaEventos[K]): Promise<void> {
  const conjunto = oyentes.get(evento);
  if (!conjunto) return;
  for (const oyente of [...conjunto]) {
    await (oyente as Oyente<K>)(datos);
  }
}

/** Solo para pruebas. */
export function limpiarOyentes(): void {
  oyentes.clear();
}
