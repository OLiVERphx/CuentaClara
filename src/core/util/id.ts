/**
 * UUID versión 7 (RFC 9562): los primeros 48 bits son la hora en milisegundos,
 * así los identificadores quedan ordenados por fecha de creación y son únicos
 * entre dispositivos sin coordinarse (DISENO.md §4.2).
 */
export function uuidv7(ahora = Date.now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let ms = ahora;
  for (let i = 5; i >= 0; i--) {
    b[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
