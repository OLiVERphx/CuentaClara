import { ahoraIso } from '../util/fechas';
import { uuidv7 } from '../util/id';

/** Campos comunes de toda tabla de negocio, preparados para sincronizar (DISENO.md §4.2). */
export interface Registro {
  id: string;
  creadoEn: string;
  actualizadoEn: string;
  /** Borrado lógico: nunca se elimina un registro físicamente. */
  eliminadoEn: string | null;
  dispositivoId: string;
  version: number;
}

let dispositivoActual = 'sin-dispositivo';

export function fijarDispositivo(id: string): void {
  dispositivoActual = id;
}

export function dispositivoId(): string {
  return dispositivoActual;
}

export function nuevoRegistro<T extends object>(datos: T): T & Registro {
  const ahora = ahoraIso();
  return {
    ...datos,
    id: uuidv7(),
    creadoEn: ahora,
    actualizadoEn: ahora,
    eliminadoEn: null,
    dispositivoId: dispositivoActual,
    version: 1,
  };
}

/** Campos a fusionar en un registro al modificarlo. */
export function marcarCambio(actual: Registro): Pick<Registro, 'actualizadoEn' | 'dispositivoId' | 'version'> {
  return { actualizadoEn: ahoraIso(), dispositivoId: dispositivoActual, version: actual.version + 1 };
}

export function vigente<T extends Registro>(registro: T): boolean {
  return registro.eliminadoEn === null;
}
