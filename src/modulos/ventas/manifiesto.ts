import type { ManifiestoModulo } from '../../app/modulos';

export const manifiestoVentas: ManifiestoModulo = {
  id: 'ventas',
  nombre: 'Ventas',
  rutas: [
    { patron: '/vender', titulo: 'Vender', cargar: () => import('./pantallas/Vender.svelte') },
    { patron: '/ventas', titulo: 'Ventas', cargar: () => import('./pantallas/Ventas.svelte') },
    { patron: '/ventas/:id', titulo: 'Venta', cargar: () => import('./pantallas/DetalleVenta.svelte') },
  ],
  menu: [
    { ruta: '/vender', titulo: 'Vender', icono: 'carrito', orden: 5 },
    { ruta: '/ventas', titulo: 'Ventas', icono: 'recibo', orden: 40 },
  ],
};
