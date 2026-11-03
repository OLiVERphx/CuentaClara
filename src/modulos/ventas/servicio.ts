import { auditar } from '../../core/auditoria/auditoria';
import { exigirPermiso, exigirSesion } from '../../core/auth/permisos';
import { leerDispositivo, leerNegocio } from '../../core/config/config';
import { db, siguienteNumero } from '../../core/db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../../core/db/registro';
import { formatearBs, formatearCantidad, formatearUsd, redondearAPaso, type Milesimas } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { emitir } from '../../core/eventos/bus';
import { METODOS_PAGO, type MetodoPago } from '../../core/pagos';
import { obtenerTasaAplicada } from '../../core/tasa/servicio';
import { ahoraIso, hoyLocal } from '../../core/util/fechas';
import { uuidv7 } from '../../core/util/id';
import { limpiar } from '../../core/util/texto';
import { sesionAbierta } from '../caja/consultas';
import {
  calcularLinea,
  equivalenteBs,
  errorCantidad,
  estadoCobro,
  lineaDesdeProducto,
  monedaDe,
  parteDeLinea,
  totalizar,
  type PagoTicket,
} from './calculos';
import type { Devolucion, DevolucionItem, Pago, Venta, VentaItem } from './tipos';

declare module '../../core/eventos/bus' {
  interface MapaEventos {
    /** Dentro de la transacción: inventario descuenta stock y caja registra los cobros. */
    'venta.registrada': { venta: Venta; items: VentaItem[]; pagos: Pago[] };
    'venta.anulada': { venta: Venta; items: VentaItem[]; pagos: Pago[]; sesionCajaId: string };
    'devolucion.registrada': { devolucion: Devolucion; items: DevolucionItem[] };
    /** Después de guardar: para que las pantallas se actualicen. */
    'ventas.cambiadas': { productoIds: string[] };
  }
}

export interface EntradaTicket {
  productoId: string;
  presentacionId: string | null;
  cantidad: Milesimas;
}

export interface VentaCompleta {
  venta: Venta;
  items: VentaItem[];
  pagos: Pago[];
  devoluciones: Devolucion[];
  devolucionItems: DevolucionItem[];
}

async function prefijo(): Promise<string> {
  return (await leerDispositivo())?.prefijo ?? 'X';
}

async function exigirCajaAbierta() {
  const sesion = await sesionAbierta();
  if (!sesion) throw new ErrorNegocio('La caja está cerrada. Ábrela para vender.');
  return sesion;
}

function validarPagos(pagos: PagoTicket[]): void {
  for (const p of pagos) {
    if (!METODOS_PAGO[p.metodo]) throw new ErrorNegocio('Método de pago no válido.');
    if (!Number.isSafeInteger(p.monto) || p.monto <= 0) {
      throw new ErrorNegocio(`${METODOS_PAGO[p.metodo].nombre}: el monto debe ser mayor que cero.`);
    }
  }
}

/**
 * Registra una venta completa en una sola transacción (DISENO.md §6.3). Los
 * precios se toman de la base de datos en ese momento, no de la pantalla.
 */
export async function registrarVenta(datos: { lineas: EntradaTicket[]; pagos: PagoTicket[]; notas?: string }): Promise<VentaCompleta> {
  const usuario = exigirSesion();
  if (datos.lineas.length === 0) throw new ErrorNegocio('El ticket está vacío.');
  validarPagos(datos.pagos);

  const resultado = await db.transaction('rw', db.tables, async () => {
    const tasa = await obtenerTasaAplicada();
    if (!tasa) throw new ErrorNegocio('No hay tasa vigente. Cárgala antes de vender.');
    const negocio = await leerNegocio();
    const redondeo = { paso: negocio?.pasoRedondeoBs ?? 100, modo: negocio?.modoRedondeo ?? 'cercano' };
    const sesion = await exigirCajaAbierta();

    const lineas = [];
    for (const entrada of datos.lineas) {
      const producto = await db.productos.get(entrada.productoId);
      if (!producto || !vigente(producto) || !producto.activo) throw new ErrorNegocio('Un producto del ticket ya no está disponible.');
      let presentacion = null;
      if (entrada.presentacionId) {
        presentacion = (await db.presentaciones.get(entrada.presentacionId)) ?? null;
        if (!presentacion || !vigente(presentacion) || presentacion.productoId !== producto.id || !presentacion.paraVenta) {
          throw new ErrorNegocio(`La presentación de «${producto.nombre}» ya no está disponible.`);
        }
      }
      const linea = lineaDesdeProducto(producto, presentacion, entrada.cantidad);
      const error = errorCantidad(linea);
      if (error) throw new ErrorNegocio(error);
      lineas.push(calcularLinea(linea, tasa.aplicada, redondeo));
    }

    const totales = totalizar(lineas);
    const estado = estadoCobro(totales, datos.pagos, tasa.aplicada, redondeo.paso);
    if (!estado.cuadrado) {
      throw new ErrorNegocio(
        estado.faltanteBs > 0
          ? `Falta cobrar ${formatearBs(estado.faltanteBs)} (${formatearUsd(estado.faltanteUsd)}).`
          : `Falta registrar el vuelto: ${formatearBs(estado.sobranteBs)} (${formatearUsd(estado.sobranteUsd)}).`,
      );
    }

    const numero = `${await prefijo()}-${String(await siguienteNumero('venta')).padStart(6, '0')}`;
    const venta: Venta = nuevoRegistro({
      numero,
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
      sesionCajaId: sesion.id,
      clienteId: null,
      tasa: tasa.aplicada,
      tasaFechaValor: tasa.tasa.fechaValor,
      pasoRedondeo: redondeo.paso,
      ...totales,
      estado: 'completada' as const,
      anuladaEn: null,
      anuladaPorNombre: null,
      motivoAnulacion: '',
      notas: limpiar(datos.notas ?? ''),
    });
    const items: VentaItem[] = lineas.map((l, posicion) =>
      nuevoRegistro({
        ventaId: venta.id,
        posicion,
        productoId: l.productoId,
        presentacionId: l.presentacionId,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        factor: l.factor,
        cantidadBase: l.cantidadBase,
        monedaPrecio: l.monedaPrecio,
        precioUnitario: l.precioUnitario,
        precioUnitarioBs: l.precioUnitarioBs,
        subtotalBs: l.subtotalBs,
        subtotalUsd: l.subtotalUsd,
        costoUnitarioBase: l.costoUnitarioBase,
      }),
    );
    const pagos: Pago[] = datos.pagos.map((p) =>
      nuevoRegistro({
        ventaId: venta.id,
        metodo: p.metodo,
        moneda: monedaDe(p.metodo),
        monto: p.monto,
        equivalenteBs: equivalenteBs(p.monto, monedaDe(p.metodo), totales, tasa.aplicada),
        referencia: limpiar(p.referencia ?? ''),
        banco: limpiar(p.banco ?? ''),
        esVuelto: p.esVuelto,
      }),
    );

    await db.ventas.add(venta);
    await db.ventaItems.bulkAdd(items);
    await db.pagos.bulkAdd(pagos);
    await emitir('venta.registrada', { venta, items, pagos });
    return { venta, items, pagos, devoluciones: [], devolucionItems: [] };
  });

  await emitir('ventas.cambiadas', { productoIds: [...new Set(resultado.items.map((i) => i.productoId))] });
  return resultado;
}

/** Anula una venta completa: devuelve el stock y revierte los cobros en la caja abierta. */
export async function anularVenta(ventaId: string, motivo: string): Promise<Venta> {
  const usuario = exigirPermiso('ventas.anular');
  if (!limpiar(motivo)) throw new ErrorNegocio('Indica el motivo de la anulación.');
  const resultado = await db.transaction('rw', db.tables, async () => {
    const venta = await db.ventas.get(ventaId);
    if (!venta) throw new ErrorNegocio('La venta no existe.');
    if (venta.estado === 'anulada') throw new ErrorNegocio('La venta ya está anulada.');
    if ((await db.devoluciones.where('ventaId').equals(ventaId).count()) > 0) {
      throw new ErrorNegocio('Esta venta tiene devoluciones. Para deshacer el resto, registra otra devolución.');
    }
    const sesion = await exigirCajaAbierta();
    const anulada: Venta = {
      ...venta,
      estado: 'anulada',
      anuladaEn: ahoraIso(),
      anuladaPorNombre: usuario.nombre,
      motivoAnulacion: limpiar(motivo),
      ...marcarCambio(venta),
    };
    await db.ventas.put(anulada);
    const items = await db.ventaItems.where('ventaId').equals(ventaId).toArray();
    const pagos = await db.pagos.where('ventaId').equals(ventaId).toArray();
    await emitir('venta.anulada', { venta: anulada, items, pagos, sesionCajaId: sesion.id });
    await auditar({ entidad: 'venta', entidadId: ventaId, accion: 'anular', despues: { numero: venta.numero, motivo: anulada.motivoAnulacion } });
    return { venta: anulada, productoIds: items.map((i) => i.productoId) };
  });
  await emitir('ventas.cambiadas', { productoIds: [...new Set(resultado.productoIds)] });
  return resultado.venta;
}

/** Devolución parcial: reingresa el stock y reintegra el dinero proporcional (D16). */
export async function registrarDevolucion(datos: {
  ventaId: string;
  items: { ventaItemId: string; cantidad: Milesimas }[];
  metodo: MetodoPago;
  motivo: string;
}): Promise<Devolucion> {
  const usuario = exigirPermiso('ventas.devolver');
  if (!limpiar(datos.motivo)) throw new ErrorNegocio('Indica el motivo de la devolución.');
  const solicitadas = datos.items.filter((i) => i.cantidad > 0);
  if (solicitadas.length === 0) throw new ErrorNegocio('Indica qué productos se devuelven.');

  const resultado = await db.transaction('rw', db.tables, async () => {
    const venta = await db.ventas.get(datos.ventaId);
    if (!venta || venta.estado !== 'completada') throw new ErrorNegocio('Solo se puede devolver de una venta completada.');
    const sesion = await exigirCajaAbierta();
    const negocio = await leerNegocio();
    const vendidos = new Map((await db.ventaItems.where('ventaId').equals(venta.id).toArray()).map((i) => [i.id, i]));
    const devueltos = new Map<string, number>();
    for (const d of await db.devolucionItems.where('ventaId').equals(venta.id).toArray()) {
      devueltos.set(d.ventaItemId, (devueltos.get(d.ventaItemId) ?? 0) + d.cantidad);
    }

    const devolucionId = uuidv7();
    const items: DevolucionItem[] = [];
    let montoBs = 0;
    let montoUsd = 0;
    for (const s of solicitadas) {
      const item = vendidos.get(s.ventaItemId);
      if (!item) throw new ErrorNegocio('Un producto no pertenece a esta venta.');
      const error = errorCantidad({ cantidad: s.cantidad, unidad: item.unidad, descripcion: item.descripcion });
      if (error) throw new ErrorNegocio(error);
      const restante = item.cantidad - (devueltos.get(item.id) ?? 0);
      if (s.cantidad > restante) {
        throw new ErrorNegocio(`«${item.descripcion}»: solo quedan por devolver ${formatearCantidad(restante, item.unidad)}.`);
      }
      const parte = parteDeLinea(item, s.cantidad);
      montoBs += parte.montoBs;
      montoUsd += parte.montoUsd;
      items.push(
        nuevoRegistro({
          devolucionId,
          ventaId: venta.id,
          ventaItemId: item.id,
          productoId: item.productoId,
          cantidad: s.cantidad,
          ...parte,
        }),
      );
    }

    const moneda = METODOS_PAGO[datos.metodo].moneda;
    let monto = moneda === 'USD' ? montoUsd : montoBs;
    if (datos.metodo === 'efectivo_bs') monto = redondearAPaso(monto, negocio?.pasoRedondeoBs ?? 100, 'cercano');
    const devolucion: Devolucion = {
      ...nuevoRegistro({
        numero: `${await prefijo()}-D${String(await siguienteNumero('devolucion')).padStart(5, '0')}`,
        ventaId: venta.id,
        sesionCajaId: sesion.id,
        metodo: datos.metodo,
        moneda,
        monto,
        montoBs,
        montoUsd,
        motivo: limpiar(datos.motivo),
        usuarioId: usuario.id,
      }),
      id: devolucionId,
    };
    await db.devoluciones.add(devolucion);
    await db.devolucionItems.bulkAdd(items);
    await emitir('devolucion.registrada', { devolucion, items });
    await auditar({ entidad: 'venta', entidadId: venta.id, accion: 'devolucion', despues: { numero: devolucion.numero, montoBs, montoUsd } });
    return { devolucion, productoIds: items.map((i) => i.productoId) };
  });
  await emitir('ventas.cambiadas', { productoIds: [...new Set(resultado.productoIds)] });
  return resultado.devolucion;
}

export async function obtenerVenta(id: string): Promise<VentaCompleta | null> {
  const venta = await db.ventas.get(id);
  if (!venta) return null;
  const [items, pagos, devoluciones, devolucionItems] = await Promise.all([
    db.ventaItems.where('ventaId').equals(id).toArray(),
    db.pagos.where('ventaId').equals(id).toArray(),
    db.devoluciones.where('ventaId').equals(id).toArray(),
    db.devolucionItems.where('ventaId').equals(id).toArray(),
  ]);
  items.sort((a, b) => a.posicion - b.posicion);
  return { venta, items, pagos, devoluciones, devolucionItems };
}

/** Ventas de un día local (`AAAA-MM-DD`) con sus pagos, de la más reciente a la más vieja. */
export async function ventasDelDia(fecha = hoyLocal()): Promise<{ venta: Venta; pagos: Pago[] }[]> {
  const desde = new Date(`${fecha}T00:00:00`);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + 1);
  const ventas = await db.ventas.where('creadoEn').between(desde.toISOString(), hasta.toISOString(), true, false).reverse().toArray();
  const pagos = await db.pagos.where('ventaId').anyOf(ventas.map((v) => v.id)).toArray();
  const porVenta = new Map<string, Pago[]>();
  for (const p of pagos) porVenta.set(p.ventaId, [...(porVenta.get(p.ventaId) ?? []), p]);
  return ventas.map((venta) => ({ venta, pagos: porVenta.get(venta.id) ?? [] }));
}
