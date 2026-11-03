export const esquemaVentas = {
  ventas: 'id, numero, creadoEn, sesionCajaId, clienteId',
  ventaItems: 'id, ventaId, productoId',
  pagos: 'id, ventaId',
  devoluciones: 'id, ventaId, creadoEn, sesionCajaId',
  devolucionItems: 'id, devolucionId, ventaId, ventaItemId',
};
