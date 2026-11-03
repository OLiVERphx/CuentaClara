import {
  bsAUsd,
  multiplicarCantidad,
  proporcional,
  redondearAPaso,
  usdABs,
  type Centavos,
  type Centimos,
  type Diezmilesimas,
  type Milesimas,
  type Redondeo,
  type Tasa4,
} from '../../core/dinero/dinero';
import { METODOS_PAGO, type MetodoPago, type Moneda } from '../../core/pagos';
import { enBs, precioEnBs, precioPresentacion, subtotalEnBs } from '../inventario/precios';
import type { MonedaPrecio, Presentacion, Producto, Unidad } from '../inventario/tipos';

/**
 * Cálculos de una venta. Son funciones puras: las usa la pantalla para la
 * vista previa y el servicio para guardar, así ambos dan siempre lo mismo.
 */

export interface LineaTicket {
  productoId: string;
  presentacionId: string | null;
  descripcion: string;
  unidad: Unidad;
  cantidad: Milesimas;
  factor: Milesimas;
  monedaPrecio: MonedaPrecio;
  precioUnitario: number;
  costoUnitarioBase: Diezmilesimas;
}

export interface LineaCalculada extends LineaTicket {
  cantidadBase: Milesimas;
  precioUnitarioBs: Centimos;
  subtotalBs: Centimos;
  subtotalUsd: Centavos;
  subtotalBsExacto: Centimos;
}

export interface Totales {
  totalBs: Centimos;
  totalUsd: Centavos;
  totalBsExacto: Centimos;
}

export function lineaDesdeProducto(producto: Producto, presentacion: Presentacion | null, cantidad: Milesimas): LineaTicket {
  return {
    productoId: producto.id,
    presentacionId: presentacion?.id ?? null,
    descripcion: presentacion ? `${producto.nombre} (${presentacion.nombre})` : producto.nombre,
    // Una presentación siempre se cuenta por unidades, aunque el producto base sea por kilo.
    unidad: presentacion ? 'unidad' : producto.unidad,
    cantidad,
    factor: presentacion?.factor ?? 1000,
    monedaPrecio: producto.monedaPrecio,
    precioUnitario: presentacion ? precioPresentacion(producto, presentacion) : producto.precio,
    costoUnitarioBase: producto.costoPromedio,
  };
}

/** Mensaje de error si la cantidad no es válida para la línea, o `null`. */
export function errorCantidad(linea: Pick<LineaTicket, 'cantidad' | 'unidad' | 'descripcion'>): string | null {
  if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) return `«${linea.descripcion}»: la cantidad debe ser mayor que cero.`;
  if (linea.unidad === 'unidad' && linea.cantidad % 1000 !== 0) return `«${linea.descripcion}»: se vende por unidades enteras.`;
  return null;
}

export function calcularLinea(linea: LineaTicket, tasa: Tasa4, redondeo: Redondeo): LineaCalculada {
  const precioUnitarioBs = precioEnBs(linea.precioUnitario, linea.monedaPrecio, tasa, redondeo);
  const subtotalBs = subtotalEnBs(precioUnitarioBs, linea.cantidad, redondeo);
  const subtotalMoneda = multiplicarCantidad(linea.precioUnitario, linea.cantidad);
  return {
    ...linea,
    cantidadBase: multiplicarCantidad(linea.factor, linea.cantidad),
    precioUnitarioBs,
    subtotalBs,
    subtotalUsd: linea.monedaPrecio === 'USD' ? subtotalMoneda : bsAUsd(subtotalBs, tasa),
    subtotalBsExacto: enBs(subtotalMoneda, linea.monedaPrecio, tasa),
  };
}

export function totalizar(lineas: Pick<LineaCalculada, 'subtotalBs' | 'subtotalUsd' | 'subtotalBsExacto'>[]): Totales {
  let totalBs = 0;
  let totalUsd = 0;
  let totalBsExacto = 0;
  for (const l of lineas) {
    totalBs += l.subtotalBs;
    totalUsd += l.subtotalUsd;
    totalBsExacto += l.subtotalBsExacto;
  }
  return { totalBs, totalUsd, totalBsExacto };
}

// ── Cobro ──────────────────────────────────────────────────────────────────

export interface PagoTicket {
  metodo: MetodoPago;
  monto: number;
  esVuelto: boolean;
  referencia?: string;
  banco?: string;
}

export function monedaDe(metodo: MetodoPago): Moneda {
  return METODOS_PAGO[metodo].moneda;
}

/**
 * Valor en Bs de un pago. Los dólares valen en proporción al ticket: pagar
 * el total en $ cubre exactamente el total en Bs, sin diferencias por el
 * redondeo de los precios.
 */
export function equivalenteBs(monto: number, moneda: Moneda, totales: Totales, tasa: Tasa4): Centimos {
  if (moneda === 'VES') return monto;
  return totales.totalUsd > 0 ? proporcional(monto, totales.totalBs, totales.totalUsd) : usdABs(monto, tasa);
}

function aUsd(montoBs: Centimos, totales: Totales, tasa: Tasa4): Centavos {
  return totales.totalBs > 0 ? proporcional(montoBs, totales.totalUsd, totales.totalBs) : bsAUsd(montoBs, tasa);
}

export interface EstadoCobro {
  /** Total menos lo pagado neto de vueltos (positivo: falta; negativo: sobra). */
  diferenciaBs: Centimos;
  cuadrado: boolean;
  faltanteBs: Centimos;
  faltanteUsd: Centavos;
  sobranteBs: Centimos;
  sobranteUsd: Centavos;
}

/**
 * Cuánto falta o sobra (DISENO.md §6.3). Se considera cuadrado si la
 * diferencia es menor que medio paso de redondeo en Bs o, si se pagó algo en
 * dólares, menor que medio centavo (el dólar no se puede partir más).
 */
export function estadoCobro(totales: Totales, pagos: PagoTicket[], tasa: Tasa4, paso: Centimos): EstadoCobro {
  let neto = 0;
  let usaUsd = false;
  for (const p of pagos) {
    const moneda = monedaDe(p.metodo);
    if (moneda === 'USD') usaUsd = true;
    neto += (p.esVuelto ? -1 : 1) * equivalenteBs(p.monto, moneda, totales, tasa);
  }
  const diferenciaBs = totales.totalBs - neto;
  const abs = Math.abs(diferenciaBs);
  const dentroDelPaso = 2 * abs <= paso;
  const dentroDelCentavo = usaUsd && totales.totalBs > 0 && 2n * BigInt(abs) * BigInt(totales.totalUsd) <= BigInt(totales.totalBs);
  const cuadrado = abs === 0 || dentroDelPaso || dentroDelCentavo;
  const falta = !cuadrado && diferenciaBs > 0 ? diferenciaBs : 0;
  const sobra = !cuadrado && diferenciaBs < 0 ? -diferenciaBs : 0;
  return {
    diferenciaBs,
    cuadrado,
    faltanteBs: falta,
    faltanteUsd: aUsd(falta, totales, tasa),
    sobranteBs: sobra,
    sobranteUsd: aUsd(sobra, totales, tasa),
  };
}

/** Monto sugerido para un pago (o vuelto) que cubra lo pendiente con ese método. */
export function montoSugerido(metodo: MetodoPago, estado: EstadoCobro, esVuelto: boolean, redondeo: Redondeo): number {
  const moneda = monedaDe(metodo);
  if (moneda === 'USD') return esVuelto ? estado.sobranteUsd : estado.faltanteUsd;
  const bs = esVuelto ? estado.sobranteBs : estado.faltanteBs;
  // En efectivo no hay céntimos: se lleva al paso de redondeo.
  return METODOS_PAGO[metodo].efectivo ? redondearAPaso(bs, redondeo.paso, 'cercano') : bs;
}

// ── Devoluciones ───────────────────────────────────────────────────────────

/** Parte proporcional de una línea al devolver `cantidad` de ella. */
export function parteDeLinea(
  item: { cantidad: Milesimas; cantidadBase: Milesimas; subtotalBs: Centimos; subtotalUsd: Centavos },
  cantidad: Milesimas,
): { cantidadBase: Milesimas; montoBs: Centimos; montoUsd: Centavos } {
  return {
    cantidadBase: proporcional(item.cantidadBase, cantidad, item.cantidad),
    montoBs: proporcional(item.subtotalBs, cantidad, item.cantidad),
    montoUsd: proporcional(item.subtotalUsd, cantidad, item.cantidad),
  };
}
