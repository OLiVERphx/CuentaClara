import type { Centavos, Centimos } from '../../core/dinero/dinero';
import type { Registro } from '../../core/db/registro';
import type { MetodoPago, Moneda } from '../../core/pagos';

export interface SesionCaja extends Registro {
  numero: number;
  /** Equipo donde se abrió: cada equipo tiene su propia caja. */
  equipoId: string;
  estado: 'abierta' | 'cerrada';
  abiertaEn: string;
  abiertaPor: string;
  abiertaPorNombre: string;
  fondoBs: Centimos;
  fondoUsd: Centavos;
  cerradaEn: string | null;
  cerradaPorNombre: string | null;
  contadoBs: Centimos | null;
  contadoUsd: Centavos | null;
  esperadoBs: Centimos | null;
  esperadoUsd: Centavos | null;
  nota: string;
}

export const TIPOS_MOVIMIENTO_CAJA = {
  venta: 'Venta',
  vuelto: 'Vuelto',
  anulacion: 'Anulación de venta',
  devolucion: 'Devolución',
  gasto: 'Gasto',
  retiro_dueno: 'Retiro del dueño',
  ingreso_extra: 'Ingreso',
} as const;

export type TipoMovimientoCaja = keyof typeof TIPOS_MOVIMIENTO_CAJA;

/** Entrada o salida de dinero de la caja. `monto` lleva signo: positivo entra, negativo sale. */
export interface MovimientoCaja extends Registro {
  sesionCajaId: string;
  tipo: TipoMovimientoCaja;
  metodo: MetodoPago;
  moneda: Moneda;
  monto: number;
  /** Equivalente en Bs (con signo), para totales en una sola moneda. */
  equivalenteBs: Centimos;
  documentoTipo: string | null;
  documentoId: string | null;
  descripcion: string;
  usuarioId: string | null;
}

export const CATEGORIAS_GASTO = {
  mercancia_menor: 'Mercancía menor / insumos',
  bolsas: 'Bolsas y empaques',
  servicios: 'Luz, agua, internet',
  alquiler: 'Alquiler',
  transporte: 'Transporte',
  mantenimiento: 'Mantenimiento',
  sueldos: 'Sueldos y ayudas',
  otro: 'Otro',
} as const;

export type CategoriaGasto = keyof typeof CATEGORIAS_GASTO;

export interface Gasto extends Registro {
  categoria: CategoriaGasto;
  descripcion: string;
  metodo: MetodoPago;
  moneda: Moneda;
  monto: number;
  /** Si el dinero salió de la caja (si no, se pagó desde otra cuenta). */
  desdeCaja: boolean;
  sesionCajaId: string | null;
  usuarioId: string | null;
}
