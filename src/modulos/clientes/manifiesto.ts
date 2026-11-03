import type { ManifiestoModulo } from '../../app/modulos';
import { suscribir } from '../../core/eventos/bus';
import { clientes } from './almacen.svelte';
import { registrarOyentesClientes } from './oyentes';

export const manifiestoClientes: ManifiestoModulo = {
  id: 'clientes',
  nombre: 'Clientes',
  rutas: [
    { patron: '/clientes', titulo: 'Clientes', cargar: () => import('./pantallas/Clientes.svelte') },
    {
      patron: '/clientes/nuevo',
      titulo: 'Nuevo cliente',
      cargar: () => import('./pantallas/FichaCliente.svelte'),
      permiso: 'clientes.gestionar',
    },
    { patron: '/clientes/:id', titulo: 'Cliente', cargar: () => import('./pantallas/FichaCliente.svelte') },
  ],
  menu: [{ ruta: '/clientes', titulo: 'Clientes', icono: 'personas', orden: 45 }],
  async iniciar() {
    registrarOyentesClientes();
    suscribir('clientes.cambiados', () => clientes.cargar());
    suscribir('ventas.cambiadas', () => clientes.cargar());
    await clientes.cargar();
  },
};
