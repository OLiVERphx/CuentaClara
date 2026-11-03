import type { Centavos, Centimos } from '../../core/dinero/dinero';
import { METODOS_PAGO, ORDEN_METODOS, type MetodoPago, type Moneda } from '../../core/pagos';
import type { MovimientoCaja, SesionCaja } from './tipos';

export interface TotalMetodo {
  metodo: MetodoPago;
  moneda: Moneda;
  entradas: number;
  salidas: number;
  neto: number;
}

export interface ResumenCaja {
  porMetodo: TotalMetodo[];
  /** Efectivo que debería haber en la gaveta (fondo + movimientos en efectivo). */
  esperadoBs: Centimos;
  esperadoUsd: Centavos;
  ventas: number;
  /** Ventas netas (cobros − vueltos − anulaciones − devoluciones), en Bs. */
  vendidoBs: Centimos;
  /** Abonos de clientes a su deuda (cobro de fiao). */
  abonosBs: Centimos;
  /** Pagos a proveedores hechos con dinero de la gaveta. */
  pagosProveedoresBs: Centimos;
  gastosBs: Centimos;
  retirosBs: Centimos;
}

const TIPOS_DE_VENTA = new Set(['venta', 'vuelto', 'anulacion', 'devolucion']);

/** Resumen de una sesión de caja (DISENO.md §6.7). Función pura: se prueba sin base de datos. */
export function resumirCaja(sesion: Pick<SesionCaja, 'fondoBs' | 'fondoUsd'>, movimientos: MovimientoCaja[]): ResumenCaja {
  const totales = new Map<MetodoPago, TotalMetodo>();
  for (const metodo of ORDEN_METODOS) {
    totales.set(metodo, { metodo, moneda: METODOS_PAGO[metodo].moneda, entradas: 0, salidas: 0, neto: 0 });
  }
  const vendidas = new Set<string>();
  const anuladas = new Set<string>();
  let vendidoBs = 0;
  let abonosBs = 0;
  let pagosProveedoresBs = 0;
  let gastosBs = 0;
  let retirosBs = 0;

  for (const m of movimientos) {
    const t = totales.get(m.metodo);
    if (t) {
      if (m.monto >= 0) t.entradas += m.monto;
      else t.salidas -= m.monto;
      t.neto += m.monto;
    }
    if (TIPOS_DE_VENTA.has(m.tipo)) vendidoBs += m.equivalenteBs;
    if (m.tipo === 'venta' && m.documentoId) vendidas.add(m.documentoId);
    if (m.tipo === 'anulacion' && m.documentoId) anuladas.add(m.documentoId);
    if (m.tipo === 'abono_cliente') abonosBs += m.equivalenteBs;
    if (m.tipo === 'pago_proveedor') pagosProveedoresBs -= m.equivalenteBs;
    if (m.tipo === 'gasto') gastosBs -= m.equivalenteBs;
    if (m.tipo === 'retiro_dueno') retirosBs -= m.equivalenteBs;
  }

  let ventas = 0;
  for (const id of vendidas) if (!anuladas.has(id)) ventas++;

  return {
    porMetodo: [...totales.values()],
    esperadoBs: sesion.fondoBs + totales.get('efectivo_bs')!.neto,
    esperadoUsd: sesion.fondoUsd + totales.get('efectivo_usd')!.neto,
    ventas,
    vendidoBs,
    abonosBs,
    pagosProveedoresBs,
    gastosBs,
    retirosBs,
  };
}
