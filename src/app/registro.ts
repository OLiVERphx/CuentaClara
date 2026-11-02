import { manifiestoInventario } from '../modulos/inventario/manifiesto';
import type { EntradaMenu, ManifiestoModulo, Ruta } from './modulos';
import { manifiestoNucleo } from './nucleo';

/** Módulos activos. Las fases siguientes agregan aquí ventas, caja, clientes y compras. */
export const MODULOS: ManifiestoModulo[] = [manifiestoNucleo, manifiestoInventario];

export const RUTAS: Ruta[] = MODULOS.flatMap((m) => m.rutas);

export const MENU: EntradaMenu[] = MODULOS.flatMap((m) => m.menu).sort((a, b) => a.orden - b.orden);
