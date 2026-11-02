/**
 * Normaliza texto para búsquedas: minúsculas, sin acentos y sin signos.
 * Los puntos y apóstrofos se eliminan sin dejar espacio ("P.A.N." → "pan");
 * el resto de signos se convierte en espacio.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'´`’]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Limpia espacios repetidos y en los extremos. */
export function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}
