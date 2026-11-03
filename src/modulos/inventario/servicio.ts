import Dexie from 'dexie';
import { auditar } from '../../core/auditoria/auditoria';
import { exigirPermiso, usuarioEnSesion } from '../../core/auth/permisos';
import { leerDispositivo } from '../../core/config/config';
import { db, siguienteNumero } from '../../core/db/db';
import { marcarCambio, nuevoRegistro, vigente } from '../../core/db/registro';
import { costoPromedio, formatearCantidad, proporcional, type Diezmilesimas, type Milesimas } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { emitir } from '../../core/eventos/bus';
import { limpiar, normalizar } from '../../core/util/texto';
import {
  TIPOS_MOVIMIENTO,
  type Categoria,
  type MonedaPrecio,
  type MovimientoInventario,
  type Presentacion,
  type Producto,
  type TipoMovimiento,
  type Unidad,
} from './tipos';

declare module '../../core/eventos/bus' {
  interface MapaEventos {
    'inventario.cambiado': { productoIds: string[] };
    'categorias.cambiadas': Record<string, never>;
  }
}

export interface DatosProducto {
  /** Vacío = se genera automáticamente. */
  codigo: string;
  codigoBarras: string;
  nombre: string;
  categoriaId: string | null;
  unidad: Unidad;
  monedaPrecio: MonedaPrecio;
  precio: number;
  costoPromedio: Diezmilesimas;
  stockMinimo: Milesimas;
  activo: boolean;
}

export interface DatosPresentacion {
  id?: string;
  nombre: string;
  factor: Milesimas;
  precio: number | null;
  codigoBarras: string;
  paraVenta: boolean;
  paraCompra: boolean;
}

const tablas = () => [
  db.productos,
  db.presentaciones,
  db.movimientosInventario,
  db.categorias,
  db.contadores,
  db.auditoria,
  db.config,
];

function esEnteroNoNegativo(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/** Las cantidades de productos por unidad deben ser enteras (evita errores de tipeo). */
function validarCantidad(cantidad: Milesimas, unidad: Unidad, nombreCampo: string): void {
  if (!Number.isSafeInteger(cantidad) || cantidad < 0) throw new ErrorNegocio(`${nombreCampo}: cantidad no válida.`);
  if (unidad === 'unidad' && cantidad % 1000 !== 0) {
    throw new ErrorNegocio(`${nombreCampo}: un producto por unidad no admite fracciones.`);
  }
}

function limpiarProducto(datos: DatosProducto): DatosProducto {
  const limpio = {
    ...datos,
    codigo: limpiar(datos.codigo).toUpperCase(),
    codigoBarras: datos.codigoBarras.replace(/\s/g, ''),
    nombre: limpiar(datos.nombre),
  };
  if (!limpio.nombre) throw new ErrorNegocio('El nombre del producto es obligatorio.');
  if (limpio.nombre.length > 120) throw new ErrorNegocio('El nombre es demasiado largo (máximo 120 caracteres).');
  if (limpio.codigo.length > 30) throw new ErrorNegocio('El código es demasiado largo (máximo 30 caracteres).');
  if (!esEnteroNoNegativo(limpio.precio)) throw new ErrorNegocio('El precio no es válido.');
  if (!esEnteroNoNegativo(limpio.costoPromedio)) throw new ErrorNegocio('El costo no es válido.');
  validarCantidad(limpio.stockMinimo, limpio.unidad, 'Stock mínimo');
  return limpio;
}

function limpiarPresentaciones(lista: DatosPresentacion[]): DatosPresentacion[] {
  const nombres = new Set<string>();
  return lista.map((p) => {
    const limpio = { ...p, nombre: limpiar(p.nombre), codigoBarras: p.codigoBarras.replace(/\s/g, '') };
    if (!limpio.nombre) throw new ErrorNegocio('Cada presentación necesita un nombre.');
    const clave = normalizar(limpio.nombre);
    if (nombres.has(clave)) throw new ErrorNegocio(`La presentación «${limpio.nombre}» está repetida.`);
    nombres.add(clave);
    if (!Number.isSafeInteger(limpio.factor) || limpio.factor <= 0) {
      throw new ErrorNegocio(`La presentación «${limpio.nombre}» debe contener una cantidad mayor que cero.`);
    }
    if (limpio.precio !== null && !esEnteroNoNegativo(limpio.precio)) {
      throw new ErrorNegocio(`El precio de «${limpio.nombre}» no es válido.`);
    }
    return limpio;
  });
}

/** Verifica que los códigos no los use otro producto. Llamar dentro de la transacción. */
async function verificarCodigos(codigo: string, barras: string[], productoId: string | null): Promise<void> {
  const ajeno = (p: { productoId?: string; id: string; eliminadoEn: string | null }) =>
    p.eliminadoEn === null && (p.productoId ?? p.id) !== productoId;

  const conCodigo = (await db.productos.where('codigo').equals(codigo).toArray()).find(ajeno);
  if (conCodigo) throw new ErrorNegocio(`El código ${codigo} ya lo usa «${conCodigo.nombre}».`);

  const vistos = new Set<string>();
  for (const b of barras) {
    if (vistos.has(b)) throw new ErrorNegocio(`El código de barras ${b} está repetido.`);
    vistos.add(b);
    const producto = (await db.productos.where('codigoBarras').equals(b).toArray()).find(ajeno);
    const presentacion = (await db.presentaciones.where('codigoBarras').equals(b).toArray()).find(ajeno);
    if (producto || presentacion) {
      const nombre = producto?.nombre ?? (await db.productos.get(presentacion!.productoId))?.nombre ?? 'otro producto';
      throw new ErrorNegocio(`El código de barras ${b} ya lo usa «${nombre}».`);
    }
  }
}

async function generarCodigo(): Promise<string> {
  const prefijo = (await leerDispositivo())?.prefijo ?? 'P';
  for (;;) {
    const codigo = `${prefijo}${String(await siguienteNumero('producto')).padStart(4, '0')}`;
    const usado = (await db.productos.where('codigo').equals(codigo).toArray()).some(vigente);
    if (!usado) return codigo;
  }
}

function barrasDe(datos: DatosProducto, presentaciones: DatosPresentacion[]): string[] {
  return [datos.codigoBarras, ...presentaciones.map((p) => p.codigoBarras)].filter((b) => b !== '');
}

/**
 * Aplica un movimiento al stock y lo deja en el kardex. Es la única vía para
 * cambiar el stock; la usarán también ventas y compras. Llamar dentro de una
 * transacción que incluya productos y movimientosInventario.
 */
export async function aplicarMovimiento(
  producto: Producto,
  mov: {
    tipo: TipoMovimiento;
    cantidad: Milesimas;
    costoUnitario?: Diezmilesimas | null;
    motivo: string;
    documentoTipo?: string | null;
    documentoId?: string | null;
  },
): Promise<Producto> {
  if (!Number.isSafeInteger(mov.cantidad) || mov.cantidad <= 0) throw new ErrorNegocio('La cantidad debe ser mayor que cero.');
  const signo = TIPOS_MOVIMIENTO[mov.tipo].signo;
  const cantidad = signo * mov.cantidad;
  const stock = producto.stock + cantidad;

  let costo = producto.costoPromedio;
  if (signo > 0 && mov.costoUnitario !== undefined && mov.costoUnitario !== null) {
    costo = costoPromedio(producto.stock, producto.costoPromedio, mov.cantidad, mov.costoUnitario);
  }

  const actualizado: Producto = { ...producto, stock, costoPromedio: costo, ...marcarCambio(producto) };
  await db.productos.put(actualizado);
  await db.movimientosInventario.add(
    nuevoRegistro({
      productoId: producto.id,
      tipo: mov.tipo,
      cantidad,
      costoUnitario: signo > 0 && mov.costoUnitario != null ? mov.costoUnitario : producto.costoPromedio,
      stockResultante: stock,
      documentoTipo: mov.documentoTipo ?? null,
      documentoId: mov.documentoId ?? null,
      motivo: limpiar(mov.motivo),
      usuarioId: usuarioEnSesion()?.id ?? null,
    }) satisfies MovimientoInventario,
  );
  return actualizado;
}

async function guardarPresentaciones(productoId: string, lista: DatosPresentacion[]): Promise<void> {
  const existentes = (await db.presentaciones.where('productoId').equals(productoId).toArray()).filter(vigente);
  const conservadas = new Set<string>();
  for (const p of lista) {
    const datos = {
      nombre: p.nombre,
      factor: p.factor,
      precio: p.precio,
      codigoBarras: p.codigoBarras || null,
      paraVenta: p.paraVenta,
      paraCompra: p.paraCompra,
    };
    const actual = p.id ? existentes.find((e) => e.id === p.id) : undefined;
    if (actual) {
      conservadas.add(actual.id);
      await db.presentaciones.put({ ...actual, ...datos, ...marcarCambio(actual) });
    } else {
      await db.presentaciones.add(nuevoRegistro({ productoId, ...datos }) satisfies Presentacion);
    }
  }
  for (const e of existentes) {
    if (!conservadas.has(e.id)) {
      await db.presentaciones.put({ ...e, eliminadoEn: new Date().toISOString(), ...marcarCambio(e) });
    }
  }
}

export async function crearProducto(
  datos: DatosProducto,
  presentaciones: DatosPresentacion[] = [],
  stockInicial: Milesimas = 0,
): Promise<Producto> {
  exigirPermiso('productos.editar');
  const limpio = limpiarProducto(datos);
  const pres = limpiarPresentaciones(presentaciones);
  validarCantidad(stockInicial, limpio.unidad, 'Stock inicial');

  const producto = await db.transaction('rw', tablas(), async () => {
    const codigo = limpio.codigo || (await generarCodigo());
    await verificarCodigos(codigo, barrasDe(limpio, pres), null);
    let nuevo: Producto = nuevoRegistro({
      ...limpio,
      codigo,
      codigoBarras: limpio.codigoBarras || null,
      nombreNormalizado: normalizar(limpio.nombre),
      stock: 0,
    });
    await db.productos.add(nuevo);
    await guardarPresentaciones(nuevo.id, pres);
    if (stockInicial > 0) {
      nuevo = await aplicarMovimiento(nuevo, {
        tipo: 'inventario_inicial',
        cantidad: stockInicial,
        costoUnitario: limpio.costoPromedio,
        motivo: 'Stock inicial al crear el producto',
      });
    }
    await auditar({ entidad: 'producto', entidadId: nuevo.id, accion: 'crear', despues: { codigo, nombre: nuevo.nombre, precio: nuevo.precio } });
    return nuevo;
  });
  await emitir('inventario.cambiado', { productoIds: [producto.id] });
  return producto;
}

const CAMPOS_AUDITADOS = ['codigo', 'codigoBarras', 'nombre', 'categoriaId', 'unidad', 'monedaPrecio', 'precio', 'costoPromedio', 'stockMinimo', 'activo'] as const;

export async function actualizarProducto(id: string, datos: DatosProducto, presentaciones: DatosPresentacion[]): Promise<Producto> {
  exigirPermiso('productos.editar');
  const limpio = limpiarProducto(datos);
  const pres = limpiarPresentaciones(presentaciones);

  const producto = await db.transaction('rw', tablas(), async () => {
    const actual = await db.productos.get(id);
    if (!actual || !vigente(actual)) throw new ErrorNegocio('El producto no existe.');
    if (actual.unidad !== limpio.unidad && actual.stock % 1000 !== 0 && limpio.unidad === 'unidad') {
      throw new ErrorNegocio('No se puede pasar a "unidad" con stock fraccionado. Ajusta el stock primero.');
    }
    const codigo = limpio.codigo || actual.codigo;
    await verificarCodigos(codigo, barrasDe(limpio, pres), id);
    const actualizado: Producto = {
      ...actual,
      ...limpio,
      codigo,
      codigoBarras: limpio.codigoBarras || null,
      nombreNormalizado: normalizar(limpio.nombre),
      ...marcarCambio(actual),
    };
    await db.productos.put(actualizado);
    await guardarPresentaciones(id, pres);

    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    for (const campo of CAMPOS_AUDITADOS) {
      if (actual[campo] !== actualizado[campo]) {
        antes[campo] = actual[campo];
        despues[campo] = actualizado[campo];
      }
    }
    if (Object.keys(despues).length > 0) await auditar({ entidad: 'producto', entidadId: id, accion: 'modificar', antes, despues });
    return actualizado;
  });
  await emitir('inventario.cambiado', { productoIds: [producto.id] });
  return producto;
}

export const TIPOS_AJUSTE = ['ajuste_positivo', 'inventario_inicial', 'merma', 'consumo_propio', 'ajuste_negativo'] as const;
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number];

/**
 * Ajuste manual de stock. A diferencia de una venta, un ajuste manual nunca
 * deja el stock en negativo: si no cuadra, primero se corrige con un conteo.
 */
export async function registrarAjuste(ajuste: {
  productoId: string;
  tipo: TipoAjuste;
  cantidad: Milesimas;
  costoUnitario?: Diezmilesimas | null;
  motivo: string;
}): Promise<Producto> {
  exigirPermiso('inventario.ajustar');
  if (!TIPOS_AJUSTE.includes(ajuste.tipo)) throw new ErrorNegocio('Tipo de ajuste no válido.');
  if (ajuste.tipo !== 'inventario_inicial' && !limpiar(ajuste.motivo)) {
    throw new ErrorNegocio('Indica el motivo del ajuste.');
  }
  const producto = await db.transaction('rw', tablas(), async () => {
    const actual = await db.productos.get(ajuste.productoId);
    if (!actual || !vigente(actual)) throw new ErrorNegocio('El producto no existe.');
    validarCantidad(ajuste.cantidad, actual.unidad, 'Cantidad');
    if (ajuste.cantidad === 0) throw new ErrorNegocio('La cantidad debe ser mayor que cero.');
    if (TIPOS_MOVIMIENTO[ajuste.tipo].signo < 0 && ajuste.cantidad > actual.stock) {
      throw new ErrorNegocio(
        `No puedes sacar ${formatearCantidad(ajuste.cantidad, actual.unidad)}: el sistema registra ${formatearCantidad(actual.stock, actual.unidad)}. Si el stock real es otro, haz un conteo físico.`,
      );
    }
    return aplicarMovimiento(actual, { ...ajuste, motivo: ajuste.motivo || TIPOS_MOVIMIENTO[ajuste.tipo].nombre });
  });
  await emitir('inventario.cambiado', { productoIds: [producto.id] });
  return producto;
}

/** Conteo físico: registra la diferencia entre lo contado y lo que dice el sistema. */
export async function registrarConteo(productoId: string, contado: Milesimas, motivo = ''): Promise<Producto> {
  exigirPermiso('inventario.ajustar');
  const producto = await db.transaction('rw', tablas(), async () => {
    const actual = await db.productos.get(productoId);
    if (!actual || !vigente(actual)) throw new ErrorNegocio('El producto no existe.');
    validarCantidad(contado, actual.unidad, 'Cantidad contada');
    const diferencia = contado - actual.stock;
    if (diferencia === 0) throw new ErrorNegocio('El conteo coincide con el sistema; no hay nada que ajustar.');
    return aplicarMovimiento(actual, {
      tipo: diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo',
      cantidad: Math.abs(diferencia),
      motivo: limpiar(motivo) || `Conteo físico: ${formatearCantidad(contado, actual.unidad)}`,
    });
  });
  await emitir('inventario.cambiado', { productoIds: [producto.id] });
  return producto;
}

export async function listarMovimientos(productoId: string, limite = 50): Promise<MovimientoInventario[]> {
  return db.movimientosInventario
    .where('[productoId+creadoEn]')
    .between([productoId, Dexie.minKey], [productoId, Dexie.maxKey])
    .reverse()
    .limit(limite)
    .toArray();
}

export async function listarMovimientosRecientes(limite = 50): Promise<MovimientoInventario[]> {
  return db.movimientosInventario.orderBy('creadoEn').reverse().limit(limite).toArray();
}

export async function listarCategorias(): Promise<Categoria[]> {
  return (await db.categorias.toArray()).filter(vigente).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Crea la categoría o devuelve la existente con el mismo nombre. */
export async function crearCategoria(nombre: string): Promise<Categoria> {
  exigirPermiso('productos.editar');
  const categoria = await db.transaction('rw', db.categorias, () => obtenerOCrearCategoria(nombre));
  await emitir('categorias.cambiadas', {});
  return categoria;
}

async function obtenerOCrearCategoria(nombre: string): Promise<Categoria> {
  const limpio = limpiar(nombre);
  if (!limpio) throw new ErrorNegocio('La categoría necesita un nombre.');
  const normal = normalizar(limpio);
  const existente = (await db.categorias.where('nombreNormalizado').equals(normal).toArray()).find(vigente);
  if (existente) return existente;
  const nueva = nuevoRegistro({ nombre: limpio, nombreNormalizado: normal });
  await db.categorias.add(nueva);
  return nueva;
}

export async function obtenerCatalogo(): Promise<{ productos: Producto[]; presentaciones: Presentacion[]; categorias: Categoria[] }> {
  const [productos, presentaciones, categorias] = await Promise.all([
    db.productos.toArray(),
    db.presentaciones.toArray(),
    listarCategorias(),
  ]);
  return { productos: productos.filter(vigente), presentaciones: presentaciones.filter(vigente), categorias };
}

export async function obtenerProductos(ids: string[]): Promise<{ productos: Producto[]; presentaciones: Presentacion[] }> {
  const productos = (await db.productos.bulkGet(ids)).filter((p): p is Producto => p !== undefined);
  const presentaciones = (await db.presentaciones.where('productoId').anyOf(ids).toArray()).filter(vigente);
  return { productos, presentaciones };
}

/**
 * Ajuste masivo de precios en una sola transacción. Las presentaciones con
 * precio propio se ajustan en la misma proporción que el precio base.
 */
export async function ajustarPrecios(cambios: { productoId: string; precio: number }[], motivo: string): Promise<number> {
  exigirPermiso('productos.editar');
  if (cambios.length === 0) throw new ErrorNegocio('No hay precios que cambiar.');
  for (const c of cambios) {
    if (!esEnteroNoNegativo(c.precio) || c.precio === 0) throw new ErrorNegocio('Un precio nuevo no es válido.');
  }
  const ids = await db.transaction('rw', tablas(), async () => {
    const tocados: string[] = [];
    for (const c of cambios) {
      const actual = await db.productos.get(c.productoId);
      if (!actual || !vigente(actual) || actual.precio === c.precio) continue;
      await db.productos.put({ ...actual, precio: c.precio, ...marcarCambio(actual) });
      for (const p of (await db.presentaciones.where('productoId').equals(actual.id).toArray()).filter(vigente)) {
        if (p.precio === null || actual.precio === 0) continue;
        await db.presentaciones.put({ ...p, precio: proporcional(p.precio, c.precio, actual.precio), ...marcarCambio(p) });
      }
      tocados.push(actual.id);
    }
    await auditar({ entidad: 'producto', entidadId: 'ajuste_masivo', accion: 'ajustar_precios', despues: { cantidad: tocados.length, motivo, cambios } });
    return tocados;
  });
  await emitir('inventario.cambiado', { productoIds: ids });
  return ids.length;
}

export interface FilaImportacion {
  datos: DatosProducto;
  categoriaNombre: string;
  stock: Milesimas;
}

/** Crea muchos productos en una sola transacción: o entran todos o ninguno. */
export async function importarProductos(filas: FilaImportacion[]): Promise<number> {
  exigirPermiso('productos.editar');
  const limpias = filas.map((f) => {
    const datos = limpiarProducto(f.datos);
    validarCantidad(f.stock, datos.unidad, `«${datos.nombre}», stock`);
    return { ...f, datos };
  });
  const ids = await db.transaction('rw', tablas(), async () => {
    const creados: string[] = [];
    for (const fila of limpias) {
      const categoriaId = fila.categoriaNombre ? (await obtenerOCrearCategoria(fila.categoriaNombre)).id : null;
      const codigo = fila.datos.codigo || (await generarCodigo());
      await verificarCodigos(codigo, fila.datos.codigoBarras ? [fila.datos.codigoBarras] : [], null);
      let producto: Producto = nuevoRegistro({
        ...fila.datos,
        codigo,
        categoriaId,
        codigoBarras: fila.datos.codigoBarras || null,
        nombreNormalizado: normalizar(fila.datos.nombre),
        stock: 0,
      });
      await db.productos.add(producto);
      if (fila.stock > 0) {
        producto = await aplicarMovimiento(producto, {
          tipo: 'inventario_inicial',
          cantidad: fila.stock,
          costoUnitario: fila.datos.costoPromedio,
          motivo: 'Importación desde CSV',
        });
      }
      creados.push(producto.id);
    }
    await auditar({ entidad: 'producto', entidadId: 'importacion', accion: 'importar_csv', despues: { cantidad: creados.length } });
    return creados;
  });
  await emitir('categorias.cambiadas', {});
  await emitir('inventario.cambiado', { productoIds: ids });
  return ids.length;
}
