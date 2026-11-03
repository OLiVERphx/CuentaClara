import type { Diezmilesimas, Milesimas, Tasa4 } from '../../core/dinero/dinero';
import type { Registro } from '../../core/db/registro';
import type { MetodoPago, Moneda } from '../../core/pagos';
import type { Unidad } from '../inventario/tipos';

export interface Proveedor extends Registro {
  nombre: string;
  nombreNormalizado: string;
  rif: string;
  telefono: string;
  contacto: string;
  nota: string;
  activo: boolean;
}

export type EstadoPagoCompra = 'pagada' | 'parcial' | 'pendiente';

export const NOMBRE_ESTADO_PAGO: Record<EstadoPagoCompra, string> = {
  pagada: 'Pagada',
  parcial: 'Abonada',
  pendiente: 'Pendiente',
};

/**
 * Factura de un proveedor. Los montos van en la moneda de la deuda (D12):
 * USD, o Bs fijo si el proveedor factura en bolívares.
 */
export interface Compra extends Registro {
  numero: string;
  proveedorId: string;
  /** Fecha de la factura, `AAAA-MM-DD`. */
  fecha: string;
  facturaProveedor: string;
  moneda: Moneda;
  /** Tasa aplicada al registrar (para convertir costos y pagos). */
  tasa: Tasa4;
  total: number;
  pagado: number;
  estadoPago: EstadoPagoCompra;
  /** Fecha límite de pago, `AAAA-MM-DD`, o `null` si no tiene. */
  vencimiento: string | null;
  notas: string;
  usuarioId: string;
}

export interface CompraItem extends Registro {
  compraId: string;
  posicion: number;
  productoId: string;
  presentacionId: string | null;
  descripcion: string;
  unidad: Unidad;
  cantidad: Milesimas;
  factor: Milesimas;
  cantidadBase: Milesimas;
  /** Costo de una unidad de la línea, en la moneda de la compra. */
  costoUnitario: number;
  subtotal: number;
  /** Costo por unidad base en USD: lo que entra al costo promedio (D7). */
  costoBaseUsd: Diezmilesimas;
}

export interface PagoProveedor extends Registro {
  compraId: string;
  proveedorId: string;
  metodo: MetodoPago;
  /** Monto en la moneda del método. */
  monto: number;
  /** Lo que descuenta de la deuda, en la moneda de la compra. */
  aplicado: number;
  tasa: Tasa4;
  /** Si el dinero salió de la gaveta de la caja abierta. */
  desdeCaja: boolean;
  sesionCajaId: string | null;
  referencia: string;
  nota: string;
  usuarioId: string;
}
