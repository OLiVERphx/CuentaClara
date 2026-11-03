import { auditar } from '../auditoria/auditoria';
import { exigirPermiso } from '../auth/permisos';
import { db } from '../db/db';
import type { ConfigDispositivo, ConfigNegocio } from '../db/tipos';
import { ErrorNegocio } from '../errores';
import { limpiar } from '../util/texto';

const CLAVE_NEGOCIO = 'negocio';
const CLAVE_DISPOSITIVO = 'dispositivo';

export const NEGOCIO_PREDETERMINADO: ConfigNegocio = {
  nombre: '',
  rif: '',
  direccion: '',
  telefono: '',
  pasoRedondeoBs: 100,
  modoRedondeo: 'cercano',
  ajusteTasa: 0,
  permitirStockNegativo: true,
  minutosBloqueo: 10,
  diasAlertaTasa: 3,
  ivaActivo: false,
};

export const PASOS_REDONDEO: { valor: number; nombre: string }[] = [
  { valor: 1, nombre: 'Sin redondeo (céntimos)' },
  { valor: 50, nombre: 'A 0,50 Bs' },
  { valor: 100, nombre: 'Al bolívar entero' },
  { valor: 500, nombre: 'A 5 Bs' },
  { valor: 1000, nombre: 'A 10 Bs' },
];

export async function leerNegocio(): Promise<ConfigNegocio | null> {
  const entrada = await db.config.get(CLAVE_NEGOCIO);
  // Se fusiona con los valores predeterminados para tolerar campos nuevos en versiones futuras.
  return entrada ? { ...NEGOCIO_PREDETERMINADO, ...(entrada.valor as Partial<ConfigNegocio>) } : null;
}

export function validarNegocio(cfg: ConfigNegocio): ConfigNegocio {
  const limpio: ConfigNegocio = {
    ...cfg,
    nombre: limpiar(cfg.nombre),
    rif: limpiar(cfg.rif).toUpperCase(),
    direccion: limpiar(cfg.direccion),
    telefono: limpiar(cfg.telefono),
  };
  if (!limpio.nombre) throw new ErrorNegocio('El nombre del negocio es obligatorio.');
  if (!Number.isInteger(limpio.minutosBloqueo) || limpio.minutosBloqueo < 1 || limpio.minutosBloqueo > 240) {
    throw new ErrorNegocio('El bloqueo automático debe estar entre 1 y 240 minutos.');
  }
  if (!Number.isInteger(limpio.ajusteTasa) || limpio.ajusteTasa < 0 || limpio.ajusteTasa > 10_000) {
    throw new ErrorNegocio('El ajuste sobre la tasa debe estar entre 0 % y 100 %.');
  }
  if (!Number.isInteger(limpio.pasoRedondeoBs) || limpio.pasoRedondeoBs < 1) {
    throw new ErrorNegocio('El paso de redondeo no es válido.');
  }
  return limpio;
}

/** Guarda la configuración. `inicial` solo se usa en el asistente, cuando aún no hay usuarios. */
export async function guardarNegocio(cfg: ConfigNegocio, opciones: { inicial?: boolean } = {}): Promise<ConfigNegocio> {
  if (!opciones.inicial) exigirPermiso('config.editar');
  const limpio = validarNegocio(cfg);
  await db.transaction('rw', db.config, db.auditoria, async () => {
    const antes = await leerNegocio();
    await db.config.put({ clave: CLAVE_NEGOCIO, valor: limpio });
    if (!opciones.inicial) {
      await auditar({ entidad: 'config', entidadId: CLAVE_NEGOCIO, accion: 'modificar', antes, despues: limpio });
    }
  });
  return limpio;
}

export async function leerDispositivo(): Promise<ConfigDispositivo | null> {
  const entrada = await db.config.get(CLAVE_DISPOSITIVO);
  return (entrada?.valor as ConfigDispositivo | undefined) ?? null;
}

export async function guardarDispositivo(dispositivo: ConfigDispositivo): Promise<void> {
  const prefijo = dispositivo.prefijo.trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(prefijo)) throw new ErrorNegocio('El prefijo debe ser una o dos letras (por ejemplo L o T).');
  await db.config.put({ clave: CLAVE_DISPOSITIVO, valor: { ...dispositivo, nombre: limpiar(dispositivo.nombre), prefijo } });
}

/** Claves de configuración que pertenecen al equipo y no viajan en un respaldo restaurado. */
export const CLAVES_LOCALES = new Set([CLAVE_DISPOSITIVO, 'bloqueoPin', 'ultimaConsultaTasa', 'respaldoAuto']);
