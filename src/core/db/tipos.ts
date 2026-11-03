import type { Rol } from '../auth/permisos';
import type { Centesimas, Centimos, ModoRedondeo, Tasa4 } from '../dinero/dinero';
import type { Registro } from './registro';

export interface EntradaConfig {
  clave: string;
  valor: unknown;
}

export interface ConfigNegocio {
  nombre: string;
  rif: string;
  direccion: string;
  telefono: string;
  /** Paso al que se redondea el precio en Bs de cada producto (D6). 100 = al bolívar entero. */
  pasoRedondeoBs: Centimos;
  modoRedondeo: ModoRedondeo;
  /** Ajuste opcional sobre la tasa BCV (D9). */
  ajusteTasa: Centesimas;
  /** Permitir vender aunque el sistema marque stock en cero (D15). */
  permitirStockNegativo: boolean;
  minutosBloqueo: number;
  /** Días tras los cuales se advierte que la tasa vigente es vieja. */
  diasAlertaTasa: number;
  ivaActivo: boolean;
}

/** Datos propios de este equipo; no se comparten al sincronizar. */
export interface ConfigDispositivo {
  id: string;
  nombre: string;
  /** Prefijo de los correlativos de este equipo: L-000123 (D4.3). */
  prefijo: string;
}

export interface Usuario extends Registro {
  nombre: string;
  rol: Rol;
  pinHash: string;
  pinSal: string;
  pinIteraciones: number;
  activo: boolean;
}

export type FuenteTasa = 'auto' | 'manual';

export interface Tasa extends Registro {
  /** Fecha desde la que rige la tasa, `AAAA-MM-DD`. */
  fechaValor: string;
  valor: Tasa4;
  fuente: FuenteTasa;
  usuarioId: string | null;
}

export interface EntradaAuditoria {
  id: string;
  creadoEn: string;
  dispositivoId: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  entidad: string;
  entidadId: string;
  accion: string;
  antes: unknown;
  despues: unknown;
}

export interface Contador {
  tipo: string;
  valor: number;
}
