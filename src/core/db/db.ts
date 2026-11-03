import Dexie, { type EntityTable } from 'dexie';
import { esquemaCaja } from '../../modulos/caja/esquema';
import type { Gasto, MovimientoCaja, SesionCaja } from '../../modulos/caja/tipos';
import { esquemaClientes } from '../../modulos/clientes/esquema';
import type { Cliente, MovimientoCuenta } from '../../modulos/clientes/tipos';
import { esquemaInventario } from '../../modulos/inventario/esquema';
import type { Categoria, MovimientoInventario, Presentacion, Producto } from '../../modulos/inventario/tipos';
import { esquemaVentas } from '../../modulos/ventas/esquema';
import type { Devolucion, DevolucionItem, Pago, Venta, VentaItem } from '../../modulos/ventas/tipos';
import type { Contador, EntradaAuditoria, EntradaConfig, Tasa, Usuario } from './tipos';

export const NOMBRE_BASE_DATOS = 'bodega';

const esquemaNucleo = {
  config: 'clave',
  usuarios: 'id',
  tasas: 'id, &fechaValor',
  auditoria: 'id, creadoEn, entidad',
  contadores: 'tipo',
};

/**
 * Base de datos local (IndexedDB).
 *
 * Migraciones: nunca se edita una versión ya publicada. Para cambiar el
 * esquema se agrega `this.version(n + 1).stores({...})` con los cambios y, si
 * hace falta transformar datos, un `.upgrade(tx => ...)`.
 */
export class BaseDatos extends Dexie {
  config!: EntityTable<EntradaConfig, 'clave'>;
  usuarios!: EntityTable<Usuario, 'id'>;
  tasas!: EntityTable<Tasa, 'id'>;
  auditoria!: EntityTable<EntradaAuditoria, 'id'>;
  contadores!: EntityTable<Contador, 'tipo'>;
  categorias!: EntityTable<Categoria, 'id'>;
  productos!: EntityTable<Producto, 'id'>;
  presentaciones!: EntityTable<Presentacion, 'id'>;
  movimientosInventario!: EntityTable<MovimientoInventario, 'id'>;
  ventas!: EntityTable<Venta, 'id'>;
  ventaItems!: EntityTable<VentaItem, 'id'>;
  pagos!: EntityTable<Pago, 'id'>;
  devoluciones!: EntityTable<Devolucion, 'id'>;
  devolucionItems!: EntityTable<DevolucionItem, 'id'>;
  sesionesCaja!: EntityTable<SesionCaja, 'id'>;
  movimientosCaja!: EntityTable<MovimientoCaja, 'id'>;
  gastos!: EntityTable<Gasto, 'id'>;
  clientes!: EntityTable<Cliente, 'id'>;
  movimientosCuenta!: EntityTable<MovimientoCuenta, 'id'>;

  constructor(nombre = NOMBRE_BASE_DATOS) {
    super(nombre);
    // v1 (Fase 1): núcleo e inventario.
    this.version(1).stores({ ...esquemaNucleo, ...esquemaInventario });
    // v2 (Fase 2): ventas y caja.
    this.version(2).stores({ ...esquemaVentas, ...esquemaCaja });
    // v3 (Fase 3): clientes y fiao.
    this.version(3).stores(esquemaClientes);
  }
}

export const db = new BaseDatos();

/** Siguiente número de un correlativo. Debe llamarse dentro de una transacción que incluya `contadores`. */
export async function siguienteNumero(tipo: string): Promise<number> {
  const actual = await db.contadores.get(tipo);
  const valor = (actual?.valor ?? 0) + 1;
  await db.contadores.put({ tipo, valor });
  return valor;
}
