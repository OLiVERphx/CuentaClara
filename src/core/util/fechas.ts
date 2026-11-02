/** Fecha local (zona del dispositivo) en formato `AAAA-MM-DD`. */
export function hoyLocal(fecha = new Date()): string {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function ahoraIso(): string {
  return new Date().toISOString();
}

export function esFechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Días calendario entre dos fechas `AAAA-MM-DD` (b − a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** `2026-11-02` → `02/11/2026`. */
export function formatearFecha(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Fecha y hora local legible a partir de un ISO. */
export function formatearFechaHora(iso: string): string {
  const f = new Date(iso);
  const hh = String(f.getHours()).padStart(2, '0');
  const mm = String(f.getMinutes()).padStart(2, '0');
  return `${formatearFecha(hoyLocal(f))} ${hh}:${mm}`;
}
