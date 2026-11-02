/** Error con un mensaje pensado para mostrarse tal cual al usuario. */
export class ErrorNegocio extends Error {
  override name = 'ErrorNegocio';
}

export class ErrorPermiso extends ErrorNegocio {
  override name = 'ErrorPermiso';
}

/** Mensaje presentable de cualquier error. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorNegocio) return error.message;
  console.error(error);
  return 'Ocurrió un error inesperado. Si se repite, haz un respaldo y avisa al soporte.';
}
