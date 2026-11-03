import { manifiestoCaja } from '../modulos/caja/manifiesto';
import { manifiestoClientes } from '../modulos/clientes/manifiesto';
import { manifiestoCompras } from '../modulos/compras/manifiesto';
import { manifiestoInventario } from '../modulos/inventario/manifiesto';
import { manifiestoVentas } from '../modulos/ventas/manifiesto';
import type { EntradaMenu, ManifiestoModulo, Ruta } from './modulos';
import { manifiestoNucleo } from './nucleo';

/**
 * Módulos activos. El orden importa: es el orden en que reaccionan a los
 * eventos (el inventario valida el stock antes de que la caja registre cobros).
 */
export const MODULOS: ManifiestoModulo[] = [
  manifiestoNucleo,
  manifiestoInventario,
  manifiestoCaja,
  manifiestoClientes,
  manifiestoCompras,
  manifiestoVentas,
];

export const RUTAS: Ruta[] = MODULOS.flatMap((m) => m.rutas);

export const MENU: EntradaMenu[] = MODULOS.flatMap((m) => m.menu).sort((a, b) => a.orden - b.orden);
