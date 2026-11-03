import { bsAUsd, proporcional, usdABs, type Diezmilesimas, type Milesimas, type Tasa4 } from '../../core/dinero/dinero';
import type { Moneda } from '../../core/pagos';
import { diasEntre } from '../../core/util/fechas';
import type { EstadoPagoCompra } from './tipos';

/**
 * Costo de una unidad base en USD (diezmilésimas) a partir del costo de una
 * unidad de la línea en la moneda de la compra. Un bulto x20 a $25 da $1,25
 * por unidad; una compra en Bs se convierte con la tasa del día (D7).
 */
export function costoBaseUsd(costoUnitario: number, moneda: Moneda, factor: Milesimas, tasa: Tasa4): Diezmilesimas {
  const porLinea = moneda === 'USD' ? costoUnitario * 100 : proporcional(costoUnitario, 1_000_000, tasa);
  return proporcional(porLinea, 1000, factor);
}

/** Convierte un pago a la moneda de la deuda con la tasa indicada. */
export function aMonedaDeuda(monto: number, monedaPago: Moneda, monedaDeuda: Moneda, tasa: Tasa4): number {
  if (monedaPago === monedaDeuda) return monto;
  return monedaDeuda === 'USD' ? bsAUsd(monto, tasa) : usdABs(monto, tasa);
}

/** Lo inverso: cuánto hay que pagar en la moneda del método para cubrir `deuda`. */
export function desdeMonedaDeuda(deuda: number, monedaDeuda: Moneda, monedaPago: Moneda, tasa: Tasa4): number {
  if (monedaPago === monedaDeuda) return deuda;
  return monedaDeuda === 'USD' ? usdABs(deuda, tasa) : bsAUsd(deuda, tasa);
}

export function estadoDePago(total: number, pagado: number): EstadoPagoCompra {
  if (pagado >= total) return 'pagada';
  return pagado > 0 ? 'parcial' : 'pendiente';
}

/**
 * Tolerancia al pagar con otra moneda: la conversión puede pasarse por una
 * fracción de la unidad más chica. Un centavo de dólar son ~9 Bs; un céntimo
 * de Bs es nada en dólares.
 */
export function toleranciaConversion(monedaPago: Moneda, monedaDeuda: Moneda, tasa: Tasa4): number {
  if (monedaPago === monedaDeuda) return 0;
  return monedaDeuda === 'VES' ? usdABs(1, tasa) : 1;
}

export type Urgencia = 'vencida' | 'pronto' | 'al_dia' | 'sin_fecha';

/** Qué tan urgente es pagar una compra pendiente. */
export function urgencia(vencimiento: string | null, hoy: string, diasAviso = 3): Urgencia {
  if (!vencimiento) return 'sin_fecha';
  const dias = diasEntre(hoy, vencimiento);
  if (dias < 0) return 'vencida';
  return dias <= diasAviso ? 'pronto' : 'al_dia';
}
