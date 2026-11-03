import { sesionAbierta } from './consultas';
import type { SesionCaja } from './tipos';

/** Estado de la caja de este equipo para las pantallas. */
class AlmacenCaja {
  sesion = $state.raw<SesionCaja | null>(null);
  /** Cambia con cada venta o movimiento: las pantallas recargan sus datos. */
  version = $state(0);

  async refrescar(): Promise<void> {
    this.sesion = await sesionAbierta();
    this.version++;
  }
}

export const caja = new AlmacenCaja();
