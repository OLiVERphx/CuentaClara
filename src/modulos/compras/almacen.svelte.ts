import { listarProveedores } from './servicio';
import type { Proveedor } from './tipos';

class AlmacenCompras {
  proveedores = $state.raw<Proveedor[]>([]);
  /** Cambia con cada compra o pago: las pantallas recargan sus datos. */
  version = $state(0);

  async cargar(): Promise<void> {
    this.proveedores = await listarProveedores();
    this.version++;
  }

  nombreProveedor(id: string): string {
    return this.proveedores.find((p) => p.id === id)?.nombre ?? '—';
  }
}

export const compras = new AlmacenCompras();
