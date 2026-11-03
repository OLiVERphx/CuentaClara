import { auditar } from '../../core/auditoria/auditoria';
import { exigirPermiso } from '../../core/auth/permisos';
import { leerDispositivo } from '../../core/config/config';
import { db, siguienteNumero } from '../../core/db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../../core/db/registro';
import { formatearCantidad, multiplicarCantidad, type Milesimas } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { emitir } from '../../core/eventos/bus';
import { esDeCuenta, formatearMonto, METODOS_PAGO, type MetodoPago, type Moneda } from '../../core/pagos';
import { obtenerTasaAplicada } from '../../core/tasa/servicio';
import { esFechaValida } from '../../core/util/fechas';
import { uuidv7 } from '../../core/util/id';
import { limpiar, normalizar } from '../../core/util/texto';
import { sesionAbierta } from '../caja/consultas';
import { aMonedaDeuda, costoBaseUsd, estadoDePago, toleranciaConversion } from './calculos';
import type { Compra, CompraItem, PagoProveedor, Proveedor } from './tipos';

declare module '../../core/eventos/bus' {
  interface MapaEventos {
    /** Dentro de la transacción: inventario suma el stock y la caja registra el pago en efectivo. */
    'compra.registrada': { compra: Compra; items: CompraItem[]; pago: PagoProveedor | null };
    'pago_proveedor.registrado': { compra: Compra; pago: PagoProveedor };
    /** Después de guardar: para que las pantallas se actualicen. */
    'compras.cambiadas': { productoIds: string[] };
  }
}

export interface DatosProveedor {
  nombre: string;
  rif: string;
  telefono: string;
  contacto: string;
  nota: string;
  activo: boolean;
}

export interface DatosPago {
  metodo: MetodoPago;
  monto: number;
  desdeCaja: boolean;
  referencia?: string;
  nota?: string;
}

export interface DatosCompra {
  proveedorId: string;
  fecha: string;
  facturaProveedor: string;
  moneda: Moneda;
  items: { productoId: string; presentacionId: string | null; cantidad: Milesimas; costoUnitario: number }[];
  vencimiento: string | null;
  /** Pago hecho al recibir la mercancía (total o parcial), o `null` si todo queda a crédito. */
  pagoInicial: DatosPago | null;
  notas: string;
}

export interface CompraCompleta {
  compra: Compra;
  items: CompraItem[];
  pagos: PagoProveedor[];
  proveedor: Proveedor | null;
}

// ── Proveedores ────────────────────────────────────────────────────────────

function limpiarProveedor(datos: DatosProveedor): DatosProveedor {
  const limpio = {
    nombre: limpiar(datos.nombre),
    rif: limpiar(datos.rif).toUpperCase(),
    telefono: limpiar(datos.telefono),
    contacto: limpiar(datos.contacto),
    nota: limpiar(datos.nota),
    activo: datos.activo,
  };
  if (!limpio.nombre) throw new ErrorNegocio('El nombre del proveedor es obligatorio.');
  return limpio;
}

export async function guardarProveedor(id: string | null, datos: DatosProveedor): Promise<Proveedor> {
  exigirPermiso('compras.gestionar');
  const limpio = limpiarProveedor(datos);
  const proveedor = await db.transaction('rw', db.proveedores, db.auditoria, async () => {
    if (!id) {
      const nuevo: Proveedor = nuevoRegistro({ ...limpio, nombreNormalizado: normalizar(limpio.nombre) });
      await db.proveedores.add(nuevo);
      await auditar({ entidad: 'proveedor', entidadId: nuevo.id, accion: 'crear', despues: limpio });
      return nuevo;
    }
    const actual = await db.proveedores.get(id);
    if (!actual || !vigente(actual)) throw new ErrorNegocio('El proveedor no existe.');
    const actualizado: Proveedor = { ...actual, ...limpio, nombreNormalizado: normalizar(limpio.nombre), ...marcarCambio(actual) };
    await db.proveedores.put(actualizado);
    return actualizado;
  });
  await emitir('compras.cambiadas', { productoIds: [] });
  return proveedor;
}

export async function listarProveedores(): Promise<Proveedor[]> {
  return (await db.proveedores.toArray()).filter(vigente).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Pagos ──────────────────────────────────────────────────────────────────

/** Arma el registro de un pago y valida que no supere la deuda. Llamar dentro de la transacción. */
async function prepararPago(compra: Compra, datos: DatosPago, usuarioId: string): Promise<{ pago: PagoProveedor; aplicado: number }> {
  if (esDeCuenta(datos.metodo)) throw new ErrorNegocio('A un proveedor se le paga con dinero.');
  if (!Number.isSafeInteger(datos.monto) || datos.monto <= 0) throw new ErrorNegocio('El monto del pago debe ser mayor que cero.');
  const monedaPago = METODOS_PAGO[datos.metodo].moneda;
  const tasa = await obtenerTasaAplicada();
  if (!tasa) throw new ErrorNegocio('No hay tasa vigente para convertir el pago.');
  const saldo = compra.total - compra.pagado;
  let aplicado = aMonedaDeuda(datos.monto, monedaPago, compra.moneda, tasa.aplicada);
  const tolerancia = toleranciaConversion(monedaPago, compra.moneda, tasa.aplicada);
  if (aplicado > saldo) {
    if (aplicado - saldo > tolerancia) {
      throw new ErrorNegocio(`El pago supera lo que se debe de esta compra (${formatearMonto(saldo, compra.moneda)}).`);
    }
    aplicado = saldo;
  } else if (saldo - aplicado < tolerancia) {
    // Lo que falta es menos que la unidad mínima del método (un centavo de dólar
    // vale ~9 Bs): no se puede pagar, así que la deuda queda saldada.
    aplicado = saldo;
  }
  let sesionCajaId: string | null = null;
  if (datos.desdeCaja) {
    const sesion = await sesionAbierta();
    if (!sesion) throw new ErrorNegocio('La caja está cerrada: no se puede pagar desde la gaveta.');
    sesionCajaId = sesion.id;
  }
  const pago: PagoProveedor = nuevoRegistro({
    compraId: compra.id,
    proveedorId: compra.proveedorId,
    metodo: datos.metodo,
    monto: datos.monto,
    aplicado,
    tasa: tasa.aplicada,
    desdeCaja: datos.desdeCaja,
    sesionCajaId,
    referencia: limpiar(datos.referencia ?? ''),
    nota: limpiar(datos.nota ?? ''),
    usuarioId,
  });
  return { pago, aplicado };
}

// ── Compras ────────────────────────────────────────────────────────────────

/**
 * Registra una compra: suma el stock (y recalcula el costo promedio), deja la
 * deuda con el proveedor y, si se pagó algo, el pago. Todo o nada.
 */
export async function registrarCompra(datos: DatosCompra): Promise<CompraCompleta> {
  const usuario = exigirPermiso('compras.gestionar');
  if (datos.items.length === 0) throw new ErrorNegocio('Agrega al menos un producto.');
  if (!esFechaValida(datos.fecha)) throw new ErrorNegocio('La fecha de la factura no es válida.');
  if (datos.vencimiento !== null && !esFechaValida(datos.vencimiento)) throw new ErrorNegocio('La fecha de vencimiento no es válida.');

  const resultado = await db.transaction('rw', db.tables, async () => {
    const tasa = await obtenerTasaAplicada();
    if (!tasa) throw new ErrorNegocio('No hay tasa vigente. Cárgala antes de registrar la compra.');
    const proveedor = await db.proveedores.get(datos.proveedorId);
    if (!proveedor || !vigente(proveedor)) throw new ErrorNegocio('Elige el proveedor.');

    const compraId = uuidv7();
    const items: CompraItem[] = [];
    let total = 0;
    for (const [posicion, entrada] of datos.items.entries()) {
      const producto = await db.productos.get(entrada.productoId);
      if (!producto || !vigente(producto)) throw new ErrorNegocio('Un producto de la compra ya no existe.');
      let presentacion = null;
      if (entrada.presentacionId) {
        presentacion = (await db.presentaciones.get(entrada.presentacionId)) ?? null;
        if (!presentacion || !vigente(presentacion) || presentacion.productoId !== producto.id) {
          throw new ErrorNegocio(`La presentación de «${producto.nombre}» ya no existe.`);
        }
      }
      const descripcion = presentacion ? `${producto.nombre} (${presentacion.nombre})` : producto.nombre;
      const unidad = presentacion ? 'unidad' : producto.unidad;
      const factor = presentacion?.factor ?? 1000;
      if (!Number.isSafeInteger(entrada.cantidad) || entrada.cantidad <= 0) throw new ErrorNegocio(`«${descripcion}»: cantidad no válida.`);
      if (unidad === 'unidad' && entrada.cantidad % 1000 !== 0) throw new ErrorNegocio(`«${descripcion}»: se compra por unidades enteras.`);
      if (!Number.isSafeInteger(entrada.costoUnitario) || entrada.costoUnitario < 0) throw new ErrorNegocio(`«${descripcion}»: costo no válido.`);
      const subtotal = multiplicarCantidad(entrada.costoUnitario, entrada.cantidad);
      total += subtotal;
      items.push(
        nuevoRegistro({
          compraId,
          posicion,
          productoId: producto.id,
          presentacionId: presentacion?.id ?? null,
          descripcion,
          unidad,
          cantidad: entrada.cantidad,
          factor,
          cantidadBase: multiplicarCantidad(factor, entrada.cantidad),
          costoUnitario: entrada.costoUnitario,
          subtotal,
          costoBaseUsd: costoBaseUsd(entrada.costoUnitario, datos.moneda, factor, tasa.aplicada),
        }),
      );
    }

    const prefijo = (await leerDispositivo())?.prefijo ?? 'X';
    let compra: Compra = {
      ...nuevoRegistro({
        numero: `${prefijo}-C${String(await siguienteNumero('compra')).padStart(5, '0')}`,
        proveedorId: proveedor.id,
        fecha: datos.fecha,
        facturaProveedor: limpiar(datos.facturaProveedor),
        moneda: datos.moneda,
        tasa: tasa.aplicada,
        total,
        pagado: 0,
        estadoPago: estadoDePago(total, 0),
        vencimiento: datos.vencimiento,
        notas: limpiar(datos.notas),
        usuarioId: usuario.id,
      }),
      id: compraId,
    };

    let pago: PagoProveedor | null = null;
    if (datos.pagoInicial) {
      const preparado = await prepararPago(compra, datos.pagoInicial, usuario.id);
      pago = preparado.pago;
      compra = { ...compra, pagado: preparado.aplicado, estadoPago: estadoDePago(total, preparado.aplicado) };
    }

    await db.compras.add(compra);
    await db.compraItems.bulkAdd(items);
    if (pago) await db.pagosProveedor.add(pago);
    await emitir('compra.registrada', { compra, items, pago });
    await auditar({ entidad: 'compra', entidadId: compra.id, accion: 'registrar', despues: { numero: compra.numero, total, moneda: compra.moneda } });
    return { compra, items, pagos: pago ? [pago] : [], proveedor };
  });

  await emitir('compras.cambiadas', { productoIds: [...new Set(resultado.items.map((i) => i.productoId))] });
  return resultado;
}

/** Abono o pago total a una compra pendiente. */
export async function registrarPagoCompra(compraId: string, datos: DatosPago): Promise<PagoProveedor> {
  const usuario = exigirPermiso('compras.gestionar');
  const pago = await db.transaction('rw', db.tables, async () => {
    const compra = await db.compras.get(compraId);
    if (!compra || !vigente(compra)) throw new ErrorNegocio('La compra no existe.');
    if (compra.estadoPago === 'pagada') throw new ErrorNegocio('Esta compra ya está pagada.');
    const { pago, aplicado } = await prepararPago(compra, datos, usuario.id);
    const pagado = compra.pagado + aplicado;
    const actualizada: Compra = { ...compra, pagado, estadoPago: estadoDePago(compra.total, pagado), ...marcarCambio(compra) };
    await db.compras.put(actualizada);
    await db.pagosProveedor.add(pago);
    await emitir('pago_proveedor.registrado', { compra: actualizada, pago });
    await auditar({ entidad: 'compra', entidadId: compraId, accion: 'pago', despues: { metodo: pago.metodo, monto: pago.monto, aplicado } });
    return pago;
  });
  await emitir('compras.cambiadas', { productoIds: [] });
  return pago;
}

export async function obtenerCompra(id: string): Promise<CompraCompleta | null> {
  const compra = await db.compras.get(id);
  if (!compra) return null;
  const [items, pagos, proveedor] = await Promise.all([
    db.compraItems.where('compraId').equals(id).toArray(),
    db.pagosProveedor.where('compraId').equals(id).toArray(),
    db.proveedores.get(compra.proveedorId),
  ]);
  items.sort((a, b) => a.posicion - b.posicion);
  pagos.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  return { compra, items, pagos, proveedor: proveedor ?? null };
}

/** Compras de la más reciente a la más vieja (todas o solo las que se deben). */
export async function listarCompras(opciones: { soloPendientes?: boolean; proveedorId?: string } = {}): Promise<Compra[]> {
  let compras = (await db.compras.orderBy('creadoEn').reverse().toArray()).filter(vigente);
  if (opciones.soloPendientes) compras = compras.filter((c) => c.estadoPago !== 'pagada');
  if (opciones.proveedorId) compras = compras.filter((c) => c.proveedorId === opciones.proveedorId);
  return compras;
}

/** Texto corto para mostrar una cantidad de una línea de compra. */
export function cantidadDeLinea(item: Pick<CompraItem, 'cantidad' | 'unidad'>): string {
  return formatearCantidad(item.cantidad, item.unidad);
}
