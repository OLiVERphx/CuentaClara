import type { Centavos, Tasa4 } from '../../core/dinero/dinero';
import type { Registro } from '../../core/db/registro';
import type { MetodoPago, Moneda } from '../../core/pagos';

export interface Cliente extends Registro {
  nombre: string;
  nombreNormalizado: string;
  cedula: string;
  telefono: string;
  /** Tope de fiao en USD; `null` = sin límite. */
  limiteCreditoUsd: Centavos | null;
  nota: string;
  activo: boolean;
  /**
   * Saldo de la cuenta en USD (D11): positivo = el cliente debe; negativo =
   * saldo a favor. Se actualiza en la misma transacción que cada movimiento.
   */
  saldoUsd: Centavos;
}

export const TIPOS_MOVIMIENTO_CUENTA = {
  cargo: 'Fiado',
  abono: 'Abono',
  consumo_saldo: 'Uso de saldo a favor',
  saldo_a_favor: 'Saldo a favor',
  anulacion: 'Anulación de venta',
  ajuste: 'Ajuste',
} as const;

export type TipoMovimientoCuenta = keyof typeof TIPOS_MOVIMIENTO_CUENTA;

/** Línea de la cuenta del cliente. `monto` en USD con signo: positivo aumenta la deuda. */
export interface MovimientoCuenta extends Registro {
  clienteId: string;
  tipo: TipoMovimientoCuenta;
  monto: Centavos;
  saldoResultante: Centavos;
  /** Cómo se pagó un abono (en su moneda original). */
  metodo: MetodoPago | null;
  moneda: Moneda | null;
  montoOriginal: number | null;
  tasa: Tasa4 | null;
  documentoTipo: string | null;
  documentoId: string | null;
  descripcion: string;
  usuarioId: string | null;
}
