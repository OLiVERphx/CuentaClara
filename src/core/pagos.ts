import { formatearBs, formatearUsd } from './dinero/dinero';

export type Moneda = 'USD' | 'VES';

/**
 * Métodos de pago. Los cinco primeros son dinero que entra a la caja; los de
 * cuenta (fiar y saldo a favor) mueven la cuenta del cliente, en USD (D11).
 */
export type MetodoPago =
  | 'efectivo_bs'
  | 'pago_movil'
  | 'punto_venta'
  | 'biopago'
  | 'efectivo_usd'
  | 'credito'
  | 'saldo_a_favor';

export interface InfoMetodo {
  nombre: string;
  moneda: Moneda;
  /** Pide número de referencia (para conciliar con el banco). */
  referencia: boolean;
  /** Es dinero físico que se cuenta al cerrar la caja. */
  efectivo: boolean;
  /** Mueve la cuenta del cliente en vez de la caja. */
  cuenta: boolean;
}

export const METODOS_PAGO: Record<MetodoPago, InfoMetodo> = {
  efectivo_bs: { nombre: 'Efectivo Bs', moneda: 'VES', referencia: false, efectivo: true, cuenta: false },
  pago_movil: { nombre: 'Pago móvil', moneda: 'VES', referencia: true, efectivo: false, cuenta: false },
  punto_venta: { nombre: 'Punto de venta', moneda: 'VES', referencia: true, efectivo: false, cuenta: false },
  biopago: { nombre: 'Biopago', moneda: 'VES', referencia: true, efectivo: false, cuenta: false },
  efectivo_usd: { nombre: 'Efectivo $', moneda: 'USD', referencia: false, efectivo: true, cuenta: false },
  credito: { nombre: 'Fiado', moneda: 'USD', referencia: false, efectivo: false, cuenta: true },
  saldo_a_favor: { nombre: 'Saldo a favor', moneda: 'USD', referencia: false, efectivo: false, cuenta: true },
};

/** Métodos con dinero real: los que pasan por la caja. */
export const ORDEN_METODOS: MetodoPago[] = ['efectivo_bs', 'pago_movil', 'punto_venta', 'biopago', 'efectivo_usd'];

export function esDeCuenta(metodo: MetodoPago): boolean {
  return METODOS_PAGO[metodo].cuenta;
}

export function formatearMonto(monto: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatearUsd(monto) : formatearBs(monto);
}
