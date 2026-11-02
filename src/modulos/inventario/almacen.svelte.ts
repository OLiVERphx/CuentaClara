import { IndiceProductos } from './busqueda';
import { listarCategorias, obtenerCatalogo, obtenerProductos } from './servicio';
import type { Categoria } from './tipos';

/**
 * Catálogo en memoria para las pantallas. El índice no es reactivo (sería
 * costoso con miles de productos); `version` avisa a las pantallas que algo cambió.
 */
class AlmacenInventario {
  readonly indice = new IndiceProductos();
  version = $state(0);
  categorias = $state.raw<Categoria[]>([]);
  cargado = $state(false);

  async cargar(): Promise<void> {
    const catalogo = await obtenerCatalogo();
    this.indice.cargar(catalogo.productos, catalogo.presentaciones, catalogo.categorias);
    this.categorias = catalogo.categorias;
    this.cargado = true;
    this.version++;
  }

  async refrescarProductos(ids: string[]): Promise<void> {
    const { productos, presentaciones } = await obtenerProductos(ids);
    for (const p of productos) {
      this.indice.poner(p, presentaciones.filter((x) => x.productoId === p.id));
    }
    this.version++;
  }

  async refrescarCategorias(): Promise<void> {
    this.categorias = await listarCategorias();
    this.indice.actualizarCategorias(this.categorias);
    this.version++;
  }
}

export const inventario = new AlmacenInventario();
