import { leerDispositivo, leerNegocio } from '../core/config/config';
import { hayUsuarios } from '../core/auth/usuarios';
import { db } from '../core/db/db';
import { fijarDispositivo } from '../core/db/registro';
import type { ConfigDispositivo, ConfigNegocio } from '../core/db/tipos';
import { suscribir } from '../core/eventos/bus';
import { ultimaConsultaTasa } from '../core/tasa/servicio';
import { hoyLocal } from '../core/util/fechas';
import { app, bloquear, consultarTasaEnLinea, refrescarTasa } from './estado.svelte';
import { MODULOS } from './registro';

const MINUTOS_ENTRE_CONSULTAS_TASA = 30;
let preparado = false;

export async function arrancar(): Promise<void> {
  try {
    // Pide al navegador no borrar los datos aunque falte espacio en disco.
    navigator.storage?.persist?.().catch(() => {});
    await db.open();
    const [negocio, dispositivo, conUsuarios] = await Promise.all([leerNegocio(), leerDispositivo(), hayUsuarios()]);
    if (!negocio || !dispositivo || !conUsuarios) {
      app.fase = 'asistente';
      return;
    }
    await prepararTrabajo(negocio, dispositivo);
    app.fase = 'bloqueado';
  } catch (error) {
    console.error(error);
    app.error =
      error instanceof Error && error.name === 'VersionError'
        ? 'Los datos son de una versión más nueva de la app. Recarga la página para actualizarla.'
        : 'No se pudo abrir la base de datos local. Revisa que el navegador no esté en modo privado.';
    app.fase = 'error';
  }
}

/** Carga lo necesario para trabajar y arranca las tareas periódicas. */
export async function prepararTrabajo(negocio: ConfigNegocio, dispositivo: ConfigDispositivo): Promise<void> {
  fijarDispositivo(dispositivo.id);
  app.negocio = negocio;
  app.dispositivo = dispositivo;
  await refrescarTasa();
  if (preparado) return;
  preparado = true;

  for (const modulo of MODULOS) await modulo.iniciar?.();
  suscribir('tasa.actualizada', () => refrescarTasa());
  suscribir('datos.restaurados', () => location.reload());
  iniciarTareasPeriodicas();
}

async function consultarSiHaceFalta(): Promise<void> {
  if (!navigator.onLine) return;
  const ultima = await ultimaConsultaTasa();
  if (Date.now() - ultima > MINUTOS_ENTRE_CONSULTAS_TASA * 60_000) await consultarTasaEnLinea();
}

function iniciarTareasPeriodicas(): void {
  void consultarSiHaceFalta();

  window.addEventListener('online', () => {
    app.enLinea = true;
    void consultarSiHaceFalta();
  });
  window.addEventListener('offline', () => (app.enLinea = false));

  // Cambio de día: activa la tasa con fecha valor de hoy.
  setInterval(() => {
    if (hoyLocal() !== app.hoy) void refrescarTasa();
    void consultarSiHaceFalta();
  }, 60_000);

  // Bloqueo automático por inactividad (DISENO.md §7).
  let ultimaActividad = Date.now();
  const marcar = () => (ultimaActividad = Date.now());
  for (const evento of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(evento, marcar, { passive: true });
  }
  setInterval(() => {
    const minutos = app.negocio?.minutosBloqueo ?? 10;
    if (app.fase === 'listo' && Date.now() - ultimaActividad > minutos * 60_000) bloquear();
  }, 15_000);
}
