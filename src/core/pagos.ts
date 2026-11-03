import { formatearBs, formatearUsd } from './dinero/dinero';

export type Moneda = 'USD' | 'VES';

/** Métodos de pago del negocio. El fiao (crédito) llega con el módulo de clientes. */
export type MetodoPago = 'efectivo_bs' | 'pago_movil' | 'punto_venta' | 'biopago' | 'efectivo_usd';

export interface InfoMetodo {
  nombre: string;
  moneda: Moneda;
  /** Pide número de referencia (para conciliar con el banco). */
  referencia: boolean;
  /** Es dinero físico que se cuenta al cerrar la caja. */
  efectivo: boolean;
}

export const METODOS_PAGO: Record<MetodoPago, InfoMetodo> = {
  efectivo_bs: { nombre: 'Efectivo Bs', moneda: 'VES', referencia: false, efectivo: true },
  pago_movil: { nombre: 'Pago móvil', moneda: 'VES', referencia: true, efectivo: false },
  punto_venta: { nombre: 'Punto de venta', moneda: 'VES', referencia: true, efectivo: false },
  biopago: { nombre: 'Biopago', moneda: 'VES', referencia: true, efectivo: false },
  efectivo_usd: { nombre: 'Efectivo $', moneda: 'USD', referencia: false, efectivo: true },
};

export const ORDEN_METODOS: MetodoPago[] = ['efectivo_bs', 'pago_movil', 'punto_venta', 'biopago', 'efectivo_usd'];

export function formatearMonto(monto: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatearUsd(monto) : formatearBs(monto);
}
