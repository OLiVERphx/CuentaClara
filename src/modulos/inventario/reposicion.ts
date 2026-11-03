import type { Milesimas } from '../../core/dinero/dinero';
import type { Presentacion, Producto } from './tipos';

export const DIAS_HISTORIAL = 14;
export const DIAS_COBERTURA = 7;

export interface Sugerencia {
  producto: Producto;
  /** Ventas promedio por día en unidades base (milésimas), según los últimos 14 días. */
  consumoDiario: Milesimas;
  /** Días que alcanza el stock al ritmo actual, o `null` si no se ha vendido. */
  diasQueAlcanza: number | null;
  /** Cuánto pedir, en unidades base. */
  sugeridoBase: Milesimas;
  /** Presentación en que conviene pedirlo (bulto, caja…), si el producto tiene una de compra. */
  presentacion: Presentacion | null;
  /** Cantidad a pedir en la presentación (o en unidades base si no hay). */
  sugerido: number;
  motivo: 'agotado' | 'bajo' | 'se_acaba';
}

/**
 * Lista de compras sugerida (DISENO.md §10, Fase 5). Un producto entra si
 * está agotado, bajo su mínimo o le quedan menos de 3 días al ritmo de venta.
 * Se pide lo necesario para cubrir el doble del mínimo o una semana de
 * ventas (lo que sea mayor), redondeado hacia arriba a la presentación de compra.
 */
export function sugerirReposicion(
  productos: Producto[],
  presentacionesPorProducto: Map<string, Presentacion[]>,
  vendidoPorProducto: Map<string, Milesimas>,
): Sugerencia[] {
  const sugerencias: Sugerencia[] = [];
  for (const producto of productos) {
    if (!producto.activo) continue;
    const vendido = vendidoPorProducto.get(producto.id) ?? 0;
    const consumoDiario = Math.round(vendido / DIAS_HISTORIAL);
    const diasQueAlcanza = consumoDiario > 0 ? Math.max(0, Math.floor(producto.stock / consumoDiario)) : null;

    let motivo: Sugerencia['motivo'] | null = null;
    if (producto.stock <= 0 && (vendido > 0 || producto.stockMinimo > 0)) motivo = 'agotado';
    else if (producto.stockMinimo > 0 && producto.stock <= producto.stockMinimo) motivo = 'bajo';
    else if (diasQueAlcanza !== null && diasQueAlcanza < 3) motivo = 'se_acaba';
    if (!motivo) continue;

    const objetivo = Math.max(producto.stockMinimo * 2, consumoDiario * DIAS_COBERTURA, producto.unidad === 'unidad' ? 1000 : 0);
    const faltante = Math.max(objetivo - producto.stock, 0);
    const presentacion = (presentacionesPorProducto.get(producto.id) ?? []).filter((p) => p.paraCompra).sort((a, b) => b.factor - a.factor)[0] ?? null;

    let sugerido: number;
    let sugeridoBase: Milesimas;
    if (presentacion) {
      sugerido = Math.max(1, Math.ceil(faltante / presentacion.factor));
      sugeridoBase = sugerido * presentacion.factor;
    } else {
      // Unidades enteras; los kilos se redondean al medio kilo.
      const paso = producto.unidad === 'unidad' ? 1000 : 500;
      sugeridoBase = Math.max(paso, Math.ceil(faltante / paso) * paso);
      sugerido = sugeridoBase;
    }
    sugerencias.push({ producto, consumoDiario, diasQueAlcanza, sugeridoBase, presentacion, sugerido, motivo });
  }
  const prioridad = { agotado: 0, bajo: 1, se_acaba: 2 };
  return sugerencias.sort((a, b) => prioridad[a.motivo] - prioridad[b.motivo] || a.producto.nombre.localeCompare(b.producto.nombre));
}

/** Cantidad de productos que necesitan reposición (para el aviso del menú). */
export function contarPorReponer(productos: Pick<Producto, 'activo' | 'stock' | 'stockMinimo'>[]): number {
  return productos.filter((p) => p.activo && (p.stock <= 0 || (p.stockMinimo > 0 && p.stock <= p.stockMinimo))).length;
}
