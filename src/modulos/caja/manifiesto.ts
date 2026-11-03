import type { ManifiestoModulo } from '../../app/modulos';
import { suscribir } from '../../core/eventos/bus';
import { caja } from './almacen.svelte';
import { registrarOyentesCaja } from './oyentes';

export const manifiestoCaja: ManifiestoModulo = {
  id: 'caja',
  nombre: 'Caja',
  rutas: [{ patron: '/caja', titulo: 'Caja', cargar: () => import('./pantallas/Caja.svelte') }],
  menu: [{ ruta: '/caja', titulo: 'Caja', icono: 'billete', orden: 50 }],
  async iniciar() {
    registrarOyentesCaja();
    suscribir('caja.cambiada', () => caja.refrescar());
    suscribir('ventas.cambiadas', () => caja.refrescar());
    suscribir('compras.cambiadas', () => caja.refrescar());
    suscribir('clientes.cambiados', () => caja.refrescar());
    await caja.refrescar();
  },
};
