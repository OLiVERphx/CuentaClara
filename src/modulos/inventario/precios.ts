import { bsAUsd, multiplicarCantidad, usdABs, type Centavos, type Centimos, type Tasa4 } from '../../core/dinero/dinero';
import type { MonedaPrecio, Presentacion, Producto } from './tipos';

export function enBs(monto: number, moneda: MonedaPrecio, tasa: Tasa4): Centimos {
  return moneda === 'USD' ? usdABs(monto, tasa) : monto;
}

/** Equivalente en USD; para productos con precio fijo en Bs es solo informativo (D5). */
export function enUsd(monto: number, moneda: MonedaPrecio, tasa: Tasa4): Centavos {
  return moneda === 'USD' ? monto : bsAUsd(monto, tasa);
}

/** Precio de una presentación en la moneda del producto. */
export function precioPresentacion(producto: Pick<Producto, 'precio'>, presentacion: Pick<Presentacion, 'precio' | 'factor'>): number {
  return presentacion.precio ?? multiplicarCantidad(producto.precio, presentacion.factor);
}

export type EstadoStock = 'agotado' | 'bajo' | 'normal';

export function estadoStock(producto: Pick<Producto, 'stock' | 'stockMinimo'>): EstadoStock {
  if (producto.stock <= 0) return 'agotado';
  if (producto.stockMinimo > 0 && producto.stock <= producto.stockMinimo) return 'bajo';
  return 'normal';
}
