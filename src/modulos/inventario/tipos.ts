import type { Diezmilesimas, Milesimas } from '../../core/dinero/dinero';
import type { Registro } from '../../core/db/registro';

export type Unidad = 'unidad' | 'kg';
export type MonedaPrecio = 'USD' | 'VES';

export interface Categoria extends Registro {
  nombre: string;
  nombreNormalizado: string;
}

export interface Producto extends Registro {
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  nombreNormalizado: string;
  categoriaId: string | null;
  /** Unidad base en la que se lleva el stock. */
  unidad: Unidad;
  /** USD por defecto; VES para productos con precio fijo en Bs (D5). */
  monedaPrecio: MonedaPrecio;
  /** Precio de la unidad base: centavos si es USD, céntimos si es VES. */
  precio: number;
  /** Costo promedio ponderado en USD (D7). */
  costoPromedio: Diezmilesimas;
  /** Solo cambia mediante movimientos de inventario. */
  stock: Milesimas;
  stockMinimo: Milesimas;
  activo: boolean;
}

/**
 * Forma de vender o comprar un producto ("Bulto x24", "Caja x20", "Medio kilo").
 * El stock siempre se lleva en la unidad base del producto.
 */
export interface Presentacion extends Registro {
  productoId: string;
  nombre: string;
  /** Unidades base que contiene, en milésimas (bulto x24 → 24000; medio kilo → 500). */
  factor: Milesimas;
  /** Precio propio en la moneda del producto; `null` = factor × precio base. */
  precio: number | null;
  codigoBarras: string | null;
  paraVenta: boolean;
  paraCompra: boolean;
}

export const TIPOS_MOVIMIENTO = {
  inventario_inicial: { nombre: 'Inventario inicial', signo: 1 },
  entrada_compra: { nombre: 'Compra', signo: 1 },
  ajuste_positivo: { nombre: 'Entrada / ajuste (+)', signo: 1 },
  devolucion: { nombre: 'Devolución de cliente', signo: 1 },
  anulacion: { nombre: 'Anulación de venta', signo: 1 },
  venta: { nombre: 'Venta', signo: -1 },
  merma: { nombre: 'Merma (dañado / vencido)', signo: -1 },
  consumo_propio: { nombre: 'Consumo propio', signo: -1 },
  ajuste_negativo: { nombre: 'Ajuste (−)', signo: -1 },
} as const;

export type TipoMovimiento = keyof typeof TIPOS_MOVIMIENTO;

/** Kardex: cada cambio de stock deja una línea inmutable. */
export interface MovimientoInventario extends Registro {
  productoId: string;
  tipo: TipoMovimiento;
  /** Con signo: positivo entra, negativo sale. */
  cantidad: Milesimas;
  costoUnitario: Diezmilesimas;
  stockResultante: Milesimas;
  documentoTipo: string | null;
  documentoId: string | null;
  motivo: string;
  usuarioId: string | null;
}
