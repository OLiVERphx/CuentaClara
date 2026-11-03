import type { ManifiestoModulo } from '../../app/modulos';
import { suscribir } from '../../core/eventos/bus';
import { compras } from './almacen.svelte';

export const manifiestoCompras: ManifiestoModulo = {
  id: 'compras',
  nombre: 'Compras',
  rutas: [
    { patron: '/compras', titulo: 'Compras', cargar: () => import('./pantallas/Compras.svelte'), permiso: 'compras.gestionar' },
    {
      patron: '/compras/nueva',
      titulo: 'Nueva compra',
      cargar: () => import('./pantallas/NuevaCompra.svelte'),
      permiso: 'compras.gestionar',
    },
    { patron: '/compras/:id', titulo: 'Compra', cargar: () => import('./pantallas/DetalleCompra.svelte'), permiso: 'compras.gestionar' },
    {
      patron: '/proveedores',
      titulo: 'Proveedores',
      cargar: () => import('./pantallas/Proveedores.svelte'),
      permiso: 'compras.gestionar',
    },
  ],
  menu: [{ ruta: '/compras', titulo: 'Compras', icono: 'camion', orden: 35, permiso: 'compras.gestionar' }],
  async iniciar() {
    suscribir('compras.cambiadas', () => compras.cargar());
    await compras.cargar();
  },
};
