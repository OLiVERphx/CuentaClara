export const esquemaCompras = {
  proveedores: 'id, nombreNormalizado',
  compras: 'id, numero, proveedorId, fecha, creadoEn',
  compraItems: 'id, compraId, productoId',
  pagosProveedor: 'id, compraId, proveedorId, creadoEn',
};
