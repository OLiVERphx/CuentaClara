import type { ManifiestoModulo } from '../../app/modulos';

/** Reportes: solo lee datos de los demás módulos; no escribe nada. */
export const manifiestoReportes: ManifiestoModulo = {
  id: 'reportes',
  nombre: 'Reportes',
  rutas: [{ patron: '/reportes', titulo: 'Reportes', cargar: () => import('./pantallas/Reportes.svelte'), permiso: 'reportes.ver' }],
  menu: [{ ruta: '/reportes', titulo: 'Reportes', icono: 'grafico', orden: 60, permiso: 'reportes.ver' }],
};
