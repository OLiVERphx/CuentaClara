import { mensajeDeError } from '../core/errores';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

export const avisos = $state<Aviso[]>([]);
let siguiente = 1;

export function avisar(texto: string, tipo: TipoAviso = 'exito', ms = 3500): void {
  const id = siguiente++;
  avisos.push({ id, tipo, texto });
  setTimeout(() => cerrarAviso(id), ms);
}

export function avisarError(error: unknown): void {
  avisar(mensajeDeError(error), 'error', 7000);
}

export function cerrarAviso(id: number): void {
  const i = avisos.findIndex((a) => a.id === id);
  if (i >= 0) avisos.splice(i, 1);
}
