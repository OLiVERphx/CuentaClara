export const esquemaClientes = {
  clientes: 'id, nombreNormalizado, cedula',
  movimientosCuenta: 'id, clienteId, [clienteId+creadoEn], creadoEn',
};
