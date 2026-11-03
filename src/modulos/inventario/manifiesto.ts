import type { ManifiestoModulo } from '../../app/modulos';
import { suscribir } from '../../core/eventos/bus';
import { inventario } from './almacen.svelte';
import { registrarOyentesInventario } from './oyentes';
import { contarPorReponer } from './reposicion';

export const manifiestoInventario: ManifiestoModulo = {
  id: 'inventario',
  nombre: 'Inventario',
  rutas: [
    { patron: '/precios', titulo: 'Consultar precios', cargar: () => import('./pantallas/Precios.svelte') },
    { patron: '/productos', titulo: 'Productos', cargar: () => import('./pantallas/Productos.svelte') },
    {
      patron: '/productos/nuevo',
      titulo: 'Nuevo producto',
      cargar: () => import('./pantallas/FichaProducto.svelte'),
      permiso: 'productos.editar',
    },
    // Antes de /productos/:id, para que «precios» no se tome como un id.
    {
      patron: '/productos/precios',
      titulo: 'Ajuste de precios',
      cargar: () => import('./pantallas/AjustePrecios.svelte'),
      permiso: 'productos.editar',
    },
    { patron: '/productos/:id', titulo: 'Producto', cargar: () => import('./pantallas/FichaProducto.svelte') },
    {
      patron: '/inventario',
      titulo: 'Ajustes de inventario',
      cargar: () => import('./pantallas/Ajustes.svelte'),
      permiso: 'inventario.ajustar',
    },
    { patron: '/inventario/reponer', titulo: 'Por reponer', cargar: () => import('./pantallas/Reponer.svelte') },
    {
      patron: '/inventario/importar',
      titulo: 'Importar productos',
      cargar: () => import('./pantallas/Importar.svelte'),
      permiso: 'productos.editar',
    },
  ],
  menu: [
    { ruta: '/precios', titulo: 'Precios', icono: 'buscar', orden: 10 },
    { ruta: '/productos', titulo: 'Productos', icono: 'caja', orden: 20 },
    {
      ruta: '/inventario',
      titulo: 'Inventario',
      icono: 'inventario',
      orden: 30,
      permiso: 'inventario.ajustar',
      insignia: () => {
        void inventario.version;
        return contarPorReponer(inventario.indice.todos());
      },
    },
  ],
  async iniciar() {
    registrarOyentesInventario();
    suscribir('inventario.cambiado', ({ productoIds }) => inventario.refrescarProductos(productoIds));
    suscribir('ventas.cambiadas', ({ productoIds }) => inventario.refrescarProductos(productoIds));
    suscribir('compras.cambiadas', ({ productoIds }) => inventario.refrescarProductos(productoIds));
    suscribir('categorias.cambiadas', () => inventario.refrescarCategorias());
    await inventario.cargar();
  },
};
