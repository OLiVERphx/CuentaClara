import type { ManifiestoModulo } from './modulos';

/** Pantallas propias del núcleo (configuración, tasa, respaldos). */
export const manifiestoNucleo: ManifiestoModulo = {
  id: 'nucleo',
  nombre: 'Núcleo',
  rutas: [{ patron: '/config', titulo: 'Configuración', cargar: () => import('./pantallas/Configuracion.svelte') }],
  menu: [{ ruta: '/config', titulo: 'Configuración', icono: 'config', orden: 90 }],
};
