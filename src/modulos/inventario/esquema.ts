/** Tablas e índices del módulo de inventario (formato de Dexie: clave primaria primero). */
export const esquemaInventario = {
  categorias: 'id, nombreNormalizado',
  productos: 'id, codigo, codigoBarras, categoriaId',
  presentaciones: 'id, productoId, codigoBarras',
  movimientosInventario: 'id, productoId, [productoId+creadoEn], creadoEn',
};
