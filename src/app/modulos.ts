import type { Component } from 'svelte';
import type { Permiso } from '../core/auth/permisos';
import type { NombreIcono } from '../ui/Icono.svelte';

/** Lo que recibe toda pantalla. */
export interface PropsPantalla {
  params: Record<string, string>;
  consulta: URLSearchParams;
}

export interface Ruta {
  /** Patrón con parámetros: `/productos/:id`. */
  patron: string;
  titulo: string;
  /**
   * Carga diferida: el código de la pantalla se descarga al abrirla.
   * Recibe `PropsPantalla`; `any` permite pantallas que no declaran props.
   */
  cargar: () => Promise<{ default: Component<any> }>;
  permiso?: Permiso;
}

export interface EntradaMenu {
  ruta: string;
  titulo: string;
  icono: NombreIcono;
  /** Posición en el menú: los módulos se intercalan por este número. */
  orden: number;
  permiso?: Permiso;
  /** Número a destacar junto a la entrada (por ejemplo, productos por reponer). Se lee de estado reactivo. */
  insignia?: () => number;
}

/**
 * Lo que un módulo aporta a la app (DISENO.md §3.3). Para agregar un módulo
 * nuevo basta con crear su manifiesto y listarlo en `registro.ts`.
 */
export interface ManifiestoModulo {
  id: string;
  nombre: string;
  rutas: Ruta[];
  menu: EntradaMenu[];
  /** Se ejecuta al abrir la app ya configurada: suscribirse a eventos, cargar datos. */
  iniciar?: () => void | Promise<void>;
}
