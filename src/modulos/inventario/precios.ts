import {
  bsAUsd,
  multiplicarCantidad,
  proporcional,
  redondearAPaso,
  usdABs,
  type Centavos,
  type Centimos,
  type Milesimas,
  type Redondeo,
  type Tasa4,
} from '../../core/dinero/dinero';
import type { MonedaPrecio, Presentacion, Producto } from './tipos';

/** Conversión exacta a Bs, sin redondear (para reportes y cálculos internos). */
export function enBs(monto: number, moneda: MonedaPrecio, tasa: Tasa4): Centimos {
  return moneda === 'USD' ? usdABs(monto, tasa) : monto;
}

/**
 * Precio en Bs tal como se muestra y se cobra (D6): la conversión desde USD se
 * redondea al paso del negocio, así el cliente que lleva una sola unidad paga
 * exactamente lo que ve. Los precios fijos en Bs no se tocan.
 */
export function precioEnBs(monto: number, moneda: MonedaPrecio, tasa: Tasa4, redondeo: Redondeo): Centimos {
  return moneda === 'USD' ? redondearAPaso(usdABs(monto, tasa), redondeo.paso, redondeo.modo) : monto;
}

/**
 * Subtotal en Bs de una cantidad, a partir del precio ya redondeado. Para
 * productos por unidad es una multiplicación exacta; para los vendidos por
 * peso el resultado se redondea de nuevo (0,350 kg × Bs 7.117 = Bs 2.491).
 */
export function subtotalEnBs(precioBs: Centimos, cantidad: Milesimas, redondeo: Redondeo): Centimos {
  return redondearAPaso(multiplicarCantidad(precioBs, cantidad), redondeo.paso, redondeo.modo);
}

/** Equivalente en USD; para productos con precio fijo en Bs es solo informativo (D5). */
export function enUsd(monto: number, moneda: MonedaPrecio, tasa: Tasa4): Centavos {
  return moneda === 'USD' ? monto : bsAUsd(monto, tasa);
}

/** Precio de una presentación en la moneda del producto. */
export function precioPresentacion(producto: Pick<Producto, 'precio'>, presentacion: Pick<Presentacion, 'precio' | 'factor'>): number {
  return presentacion.precio ?? multiplicarCantidad(producto.precio, presentacion.factor);
}

/** Regla del ajuste masivo: subir/bajar un porcentaje, o fijar un margen sobre el costo. */
export type ReglaPrecio = { tipo: 'porcentaje'; centesimas: number } | { tipo: 'margen'; centesimas: number };

/**
 * Nuevo precio según la regla, redondeado hacia arriba al múltiplo `paso`
 * (por ejemplo, 5 = a $0,05). Devuelve `null` si la regla no aplica: el margen
 * necesita costo y precio en USD, y un margen de 100 % o más no tiene sentido.
 */
export function nuevoPrecio(
  producto: Pick<Producto, 'precio' | 'costoPromedio' | 'monedaPrecio'>,
  regla: ReglaPrecio,
  paso: number,
): number | null {
  let crudo: number;
  if (regla.tipo === 'porcentaje') {
    if (regla.centesimas <= -10_000) return null;
    crudo = proporcional(producto.precio, 10_000 + regla.centesimas, 10_000);
  } else {
    if (producto.monedaPrecio !== 'USD' || producto.costoPromedio <= 0 || regla.centesimas <= 0 || regla.centesimas >= 10_000) return null;
    // precio = costo ÷ (1 − margen); el costo está en diezmilésimas y el precio en centavos.
    crudo = proporcional(producto.costoPromedio, 10_000, (10_000 - regla.centesimas) * 100);
  }
  return redondearAPaso(crudo, Math.max(paso, 1), 'arriba');
}

export type EstadoStock = 'agotado' | 'bajo' | 'normal';

export function estadoStock(producto: Pick<Producto, 'stock' | 'stockMinimo'>): EstadoStock {
  if (producto.stock <= 0) return 'agotado';
  if (producto.stockMinimo > 0 && producto.stock <= producto.stockMinimo) return 'bajo';
  return 'normal';
}
