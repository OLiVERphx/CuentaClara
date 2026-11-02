import { aplicarAjuste, type Centesimas, type Tasa4 } from '../dinero/dinero';
import type { Tasa } from '../db/tipos';
import { diasEntre } from '../util/fechas';

/**
 * Tasa vigente: la de mayor fecha valor que no sea futura (D8, DISENO.md §6.2).
 * Así una tasa publicada hoy para mañana se activa sola al cambiar el día,
 * y los fines de semana sigue rigiendo la del último día hábil.
 */
export function elegirVigente<T extends Pick<Tasa, 'fechaValor' | 'eliminadoEn'>>(tasas: T[], hoy: string): T | null {
  let mejor: T | null = null;
  for (const t of tasas) {
    if (t.eliminadoEn !== null || t.fechaValor > hoy) continue;
    if (!mejor || t.fechaValor > mejor.fechaValor) mejor = t;
  }
  return mejor;
}

/** Tasa publicada con fecha valor futura (por ejemplo, la de mañana), si existe. */
export function elegirProxima<T extends Pick<Tasa, 'fechaValor' | 'eliminadoEn'>>(tasas: T[], hoy: string): T | null {
  let proxima: T | null = null;
  for (const t of tasas) {
    if (t.eliminadoEn !== null || t.fechaValor <= hoy) continue;
    if (!proxima || t.fechaValor < proxima.fechaValor) proxima = t;
  }
  return proxima;
}

export function antiguedadEnDias(tasa: Pick<Tasa, 'fechaValor'>, hoy: string): number {
  return diasEntre(tasa.fechaValor, hoy);
}

export function tasaEstaVieja(tasa: Pick<Tasa, 'fechaValor'>, hoy: string, diasAlerta: number): boolean {
  return antiguedadEnDias(tasa, hoy) > diasAlerta;
}

export function tasaAplicada(tasa: Pick<Tasa, 'valor'>, ajuste: Centesimas): Tasa4 {
  return aplicarAjuste(tasa.valor, ajuste);
}
