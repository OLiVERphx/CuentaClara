import type { Centavos, Centimos, Diezmilesimas, Milesimas, Tasa4 } from '../../core/dinero/dinero';
import type { Registro } from '../../core/db/registro';
import type { MetodoPago, Moneda } from '../../core/pagos';
import type { MonedaPrecio, Unidad } from '../inventario/tipos';

export interface Venta extends Registro {
  numero: string;
  usuarioId: string;
  usuarioNombre: string;
  sesionCajaId: string;
  clienteId: string | null;
  /** Tasa aplicada (con el ajuste del negocio), copiada al momento de vender. */
  tasa: Tasa4;
  tasaFechaValor: string;
  pasoRedondeo: Centimos;
  totalUsd: Centavos;
  /** Lo que se cobró: suma de las líneas con precio redondeado (D6). */
  totalBs: Centimos;
  /** Conversión exacta sin redondeo, para reportes. */
  totalBsExacto: Centimos;
  estado: 'completada' | 'anulada';
  anuladaEn: string | null;
  anuladaPorNombre: string | null;
  motivoAnulacion: string;
  notas: string;
}

/** Línea de venta. Copia precios y costo del momento: si mañana cambian, la venta no cambia. */
export interface VentaItem extends Registro {
  ventaId: string;
  /** Orden de la línea en el ticket. */
  posicion: number;
  productoId: string;
  presentacionId: string | null;
  descripcion: string;
  /** Unidad de la línea: 'kg' solo si se vendió por peso. */
  unidad: Unidad;
  /** Cantidad vendida en la unidad de la línea (presentaciones o kg). */
  cantidad: Milesimas;
  /** Unidades base que contiene cada unidad de la línea. */
  factor: Milesimas;
  /** Lo que sale del stock. */
  cantidadBase: Milesimas;
  monedaPrecio: MonedaPrecio;
  precioUnitario: number;
  precioUnitarioBs: Centimos;
  subtotalBs: Centimos;
  subtotalUsd: Centavos;
  costoUnitarioBase: Diezmilesimas;
}

export interface Pago extends Registro {
  ventaId: string;
  metodo: MetodoPago;
  moneda: Moneda;
  monto: number;
  equivalenteBs: Centimos;
  referencia: string;
  banco: string;
  /** Dinero que se le devolvió al cliente. */
  esVuelto: boolean;
}

export interface Devolucion extends Registro {
  numero: string;
  ventaId: string;
  sesionCajaId: string;
  metodo: MetodoPago;
  moneda: Moneda;
  /** Lo que se le reintegró al cliente, en la moneda del método. */
  monto: number;
  montoBs: Centimos;
  montoUsd: Centavos;
  motivo: string;
  usuarioId: string;
}

export interface DevolucionItem extends Registro {
  devolucionId: string;
  ventaId: string;
  ventaItemId: string;
  productoId: string;
  cantidad: Milesimas;
  cantidadBase: Milesimas;
  montoBs: Centimos;
  montoUsd: Centavos;
}
