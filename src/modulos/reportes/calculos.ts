import { bsAUsd, proporcional, type Centavos, type Centimos, type Milesimas } from '../../core/dinero/dinero';
import type { Tasa } from '../../core/db/tipos';
import { ORDEN_METODOS, METODOS_PAGO, type MetodoPago } from '../../core/pagos';
import { elegirVigente } from '../../core/tasa/logica';
import { hoyLocal, sumarDias } from '../../core/util/fechas';
import type { Gasto } from '../caja/tipos';
import type { Devolucion, DevolucionItem, Pago, Venta, VentaItem } from '../ventas/tipos';

/**
 * Reportes del período (DISENO.md §9). La contabilidad se lleva en USD
 * porque los costos están en USD; los montos en Bs son los realmente cobrados.
 */

export interface DatosPeriodo {
  ventas: Venta[];
  items: VentaItem[];
  pagos: Pago[];
  devoluciones: Devolucion[];
  devolucionItems: DevolucionItem[];
  /** Líneas de venta a las que apuntan las devoluciones (pueden ser de ventas anteriores al período). */
  itemsDevueltos: VentaItem[];
  gastos: Gasto[];
  tasas: Tasa[];
}

export interface DiaReporte {
  fecha: string;
  ventas: number;
  usd: Centavos;
  bs: Centimos;
}

export interface MetodoReporte {
  metodo: MetodoPago;
  /** Lo cobrado con el método, en su moneda. */
  monto: number;
  equivalenteBs: Centimos;
  /** Vueltos entregados con el método, en su moneda. */
  vuelto: number;
  vueltoBs: Centimos;
}

export interface ProductoReporte {
  productoId: string;
  descripcion: string;
  cantidadBase: Milesimas;
  ventasUsd: Centavos;
  gananciaUsd: Centavos;
}

export interface ResumenPeriodo {
  ventas: number;
  anuladas: number;
  ventasUsd: Centavos;
  ventasBs: Centimos;
  devolucionesUsd: Centavos;
  netoUsd: Centavos;
  netoBs: Centimos;
  costoUsd: Centavos;
  gananciaBrutaUsd: Centavos;
  gastosUsd: Centavos;
  gananciaNetaUsd: Centavos;
  /** Centésimas de porcentaje sobre las ventas netas, o `null` si no hubo ventas. */
  margenBruto: number | null;
  ticketPromedioUsd: Centavos;
  porDia: DiaReporte[];
  porMetodo: MetodoReporte[];
  productos: ProductoReporte[];
}

const diaDe = (iso: string) => hoyLocal(new Date(iso));

/** Costo en USD (centavos) de `cantidadBase` a un costo por unidad base en diezmilésimas. */
function costoDe(costoUnitarioBase: number, cantidadBase: Milesimas): Centavos {
  return proporcional(costoUnitarioBase, cantidadBase, 100_000);
}

export function resumirPeriodo(datos: DatosPeriodo, desde: string, hasta: string): ResumenPeriodo {
  const completadas = datos.ventas.filter((v) => v.estado === 'completada');
  const idsCompletadas = new Set(completadas.map((v) => v.id));

  const porDia = new Map<string, DiaReporte>();
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) porDia.set(f, { fecha: f, ventas: 0, usd: 0, bs: 0 });

  let ventasUsd = 0;
  let ventasBs = 0;
  for (const v of completadas) {
    ventasUsd += v.totalUsd;
    ventasBs += v.totalBs;
    const d = porDia.get(diaDe(v.creadoEn));
    if (d) {
      d.ventas++;
      d.usd += v.totalUsd;
      d.bs += v.totalBs;
    }
  }

  // Productos y costo de lo vendido.
  const productos = new Map<string, ProductoReporte>();
  let costoUsd = 0;
  for (const item of datos.items) {
    if (!idsCompletadas.has(item.ventaId)) continue;
    const costo = costoDe(item.costoUnitarioBase, item.cantidadBase);
    costoUsd += costo;
    const p = productos.get(item.productoId) ?? {
      productoId: item.productoId,
      descripcion: item.descripcion.replace(/ \(.*\)$/, ''),
      cantidadBase: 0,
      ventasUsd: 0,
      gananciaUsd: 0,
    };
    p.cantidadBase += item.cantidadBase;
    p.ventasUsd += item.subtotalUsd;
    p.gananciaUsd += item.subtotalUsd - costo;
    productos.set(item.productoId, p);
  }

  // Devoluciones del período: restan ventas y costo.
  const lineas = new Map(datos.itemsDevueltos.map((i) => [i.id, i]));
  let devolucionesUsd = 0;
  let devolucionesBs = 0;
  for (const d of datos.devoluciones) {
    devolucionesUsd += d.montoUsd;
    devolucionesBs += d.montoBs;
    // El gráfico por día también es neto, igual que el total.
    const dia = porDia.get(diaDe(d.creadoEn));
    if (dia) {
      dia.usd -= d.montoUsd;
      dia.bs -= d.montoBs;
    }
  }
  for (const di of datos.devolucionItems) {
    const linea = lineas.get(di.ventaItemId);
    if (!linea) continue;
    const costo = costoDe(linea.costoUnitarioBase, di.cantidadBase);
    costoUsd -= costo;
    const p = productos.get(di.productoId);
    if (p) {
      p.cantidadBase -= di.cantidadBase;
      p.ventasUsd -= di.montoUsd;
      p.gananciaUsd -= di.montoUsd - costo;
    }
  }

  // Cobros y vueltos por método, por separado (un vuelto en Bs a un pago en $ no es un «cobro negativo»).
  const metodos = new Map<MetodoPago, MetodoReporte>();
  for (const p of datos.pagos) {
    if (!idsCompletadas.has(p.ventaId)) continue;
    const m = metodos.get(p.metodo) ?? { metodo: p.metodo, monto: 0, equivalenteBs: 0, vuelto: 0, vueltoBs: 0 };
    if (p.esVuelto) {
      m.vuelto += p.monto;
      m.vueltoBs += p.equivalenteBs;
    } else {
      m.monto += p.monto;
      m.equivalenteBs += p.equivalenteBs;
    }
    metodos.set(p.metodo, m);
  }
  const orden = [...ORDEN_METODOS, 'credito', 'saldo_a_favor'] as MetodoPago[];
  const porMetodo = orden.map((m) => metodos.get(m)).filter((m): m is MetodoReporte => !!m && (m.monto > 0 || m.vuelto > 0));

  // Gastos en USD con la tasa vigente el día de cada gasto.
  let gastosUsd = 0;
  for (const g of datos.gastos) {
    if (METODOS_PAGO[g.metodo].moneda === 'USD') gastosUsd += g.monto;
    else {
      const tasa = elegirVigente(datos.tasas, diaDe(g.creadoEn));
      if (tasa) gastosUsd += bsAUsd(g.monto, tasa.valor);
    }
  }

  const netoUsd = ventasUsd - devolucionesUsd;
  const gananciaBrutaUsd = netoUsd - costoUsd;
  return {
    ventas: completadas.length,
    anuladas: datos.ventas.length - completadas.length,
    ventasUsd,
    ventasBs,
    devolucionesUsd,
    netoUsd,
    netoBs: ventasBs - devolucionesBs,
    costoUsd,
    gananciaBrutaUsd,
    gastosUsd,
    gananciaNetaUsd: gananciaBrutaUsd - gastosUsd,
    margenBruto: netoUsd > 0 ? proporcional(gananciaBrutaUsd, 10_000, netoUsd) : null,
    ticketPromedioUsd: completadas.length ? Math.round(ventasUsd / completadas.length) : 0,
    porDia: [...porDia.values()],
    porMetodo,
    productos: [...productos.values()].filter((p) => p.cantidadBase > 0).sort((a, b) => b.ventasUsd - a.ventasUsd),
  };
}

/** Foto del inventario: lo que vale la mercancía a costo y cuánto falta reponer. */
export function resumirInventario(productos: { stock: Milesimas; costoPromedio: number; stockMinimo: Milesimas; activo: boolean }[]) {
  let valorUsd = 0;
  let agotados = 0;
  let bajos = 0;
  for (const p of productos) {
    if (!p.activo) continue;
    if (p.stock > 0) valorUsd += costoDe(p.costoPromedio, p.stock);
    if (p.stock <= 0) agotados++;
    else if (p.stockMinimo > 0 && p.stock <= p.stockMinimo) bajos++;
  }
  return { valorUsd, agotados, bajos };
}

export type Periodo = 'hoy' | 'ayer' | '7dias' | '30dias' | 'mes';

export const NOMBRE_PERIODO: Record<Periodo, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7dias': 'Últimos 7 días',
  '30dias': 'Últimos 30 días',
  mes: 'Este mes',
};

export function rangoDe(periodo: Periodo, hoy: string): { desde: string; hasta: string } {
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer':
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
    case '7dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30dias':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'mes':
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  }
}
