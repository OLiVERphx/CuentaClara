import type { Ruta } from './modulos';

export const RUTA_INICIAL = '/precios';

function leerHash(): { ruta: string; consulta: URLSearchParams } {
  const hash = location.hash.replace(/^#/, '') || RUTA_INICIAL;
  const [ruta = RUTA_INICIAL, consulta = ''] = hash.split('?');
  return { ruta: ruta === '/' ? RUTA_INICIAL : ruta, consulta: new URLSearchParams(consulta) };
}

/** Navegación por hash (#/productos): funciona en cualquier hosting estático y sin conexión. */
export const navegacion = $state(leerHash());

window.addEventListener('hashchange', () => {
  const { ruta, consulta } = leerHash();
  navegacion.ruta = ruta;
  navegacion.consulta = consulta;
});

export function navegar(ruta: string): void {
  location.hash = ruta;
}

export function coincidir(patron: string, ruta: string): Record<string, string> | null {
  const a = patron.split('/').filter(Boolean);
  const b = ruta.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(b[i]!);
    else if (p !== b[i]) return null;
  }
  return params;
}

export function resolver(rutas: Ruta[], ruta: string): { ruta: Ruta; params: Record<string, string> } | null {
  for (const r of rutas) {
    const params = coincidir(r.patron, ruta);
    if (params) return { ruta: r, params };
  }
  return null;
}
