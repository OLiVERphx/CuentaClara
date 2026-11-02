import { cerrarSesion, iniciarSesion, rolTienePermiso, type Permiso, type Rol } from '../core/auth/permisos';
import type { Tasa4 } from '../core/dinero/dinero';
import type { ConfigDispositivo, ConfigNegocio, Tasa } from '../core/db/tipos';
import { mensajeDeError } from '../core/errores';
import { tasaAplicada, tasaEstaVieja } from '../core/tasa/logica';
import { actualizarTasaAutomatica, obtenerTasaProxima, obtenerTasaVigente } from '../core/tasa/servicio';
import { hoyLocal } from '../core/util/fechas';

export type Fase = 'cargando' | 'asistente' | 'bloqueado' | 'listo' | 'error';

/** Estado global de la interfaz. La lógica de negocio vive en core/ y modulos/. */
export const app = $state({
  fase: 'cargando' as Fase,
  error: '',
  negocio: null as ConfigNegocio | null,
  dispositivo: null as ConfigDispositivo | null,
  usuario: null as { id: string; nombre: string; rol: Rol } | null,
  tasa: null as Tasa | null,
  tasaProxima: null as Tasa | null,
  hoy: hoyLocal(),
  enLinea: navigator.onLine,
  consultandoTasa: false,
  errorTasa: '',
});

export function puede(permiso: Permiso): boolean {
  return app.usuario !== null && rolTienePermiso(app.usuario.rol, permiso);
}

/** Tasa con el ajuste del negocio, la que se usa para todos los precios en Bs. */
export function tasaDelDia(): Tasa4 | null {
  if (!app.tasa || !app.negocio) return null;
  return tasaAplicada(app.tasa, app.negocio.ajusteTasa);
}

export function tasaVieja(): boolean {
  return app.tasa !== null && app.negocio !== null && tasaEstaVieja(app.tasa, app.hoy, app.negocio.diasAlertaTasa);
}

export async function refrescarTasa(): Promise<void> {
  app.hoy = hoyLocal();
  const [vigente, proxima] = await Promise.all([obtenerTasaVigente(app.hoy), obtenerTasaProxima(app.hoy)]);
  app.tasa = vigente;
  app.tasaProxima = proxima;
}

export async function consultarTasaEnLinea(): Promise<boolean> {
  if (app.consultandoTasa) return false;
  app.consultandoTasa = true;
  try {
    await actualizarTasaAutomatica();
    app.errorTasa = '';
    await refrescarTasa();
    return true;
  } catch (error) {
    app.errorTasa = mensajeDeError(error);
    return false;
  } finally {
    app.consultandoTasa = false;
  }
}

export function abrirSesion(usuario: { id: string; nombre: string; rol: Rol }): void {
  iniciarSesion(usuario);
  app.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
  app.fase = 'listo';
}

export function bloquear(): void {
  cerrarSesion();
  app.usuario = null;
  app.fase = 'bloqueado';
}
