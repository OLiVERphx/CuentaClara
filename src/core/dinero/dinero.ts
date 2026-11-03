/**
 * Aritmética de dinero y cantidades sin decimales flotantes (DISENO.md §4.1).
 *
 * Todo valor se guarda como entero en una escala fija:
 *   Centavos       USD × 100        (precios, totales y pagos en USD)
 *   Diezmilesimas  USD × 10.000     (costos unitarios)
 *   Centimos       Bs × 100
 *   Tasa4          Bs por USD × 10.000
 *   Milesimas      cantidad × 1.000 (1 unidad = 1000; 0,250 kg = 250)
 *   Centesimas     porcentaje × 100 (2,5 % = 250)
 *
 * Las multiplicaciones se hacen con BigInt para no desbordar y el redondeo
 * es siempre "mitad lejos de cero", en un único paso por operación.
 */

export type Centavos = number;
export type Diezmilesimas = number;
export type Centimos = number;
export type Tasa4 = number;
export type Milesimas = number;
export type Centesimas = number;

export type ModoRedondeo = 'cercano' | 'arriba' | 'abajo';

export interface Redondeo {
  paso: Centimos;
  modo: ModoRedondeo;
}

export const ESCALA = {
  centavos: 2,
  diezmilesimas: 4,
  centimos: 2,
  tasa: 4,
  milesimas: 3,
  centesimas: 2,
} as const;

/** División entera con redondeo "mitad lejos de cero". */
export function dividir(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError('División entre cero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const dobleResto = (r < 0n ? -r : r) * 2n;
  if (dobleResto >= d) return n < 0n ? q - 1n : q + 1n;
  return q;
}

function aBig(valor: number, nombre: string): bigint {
  if (!Number.isSafeInteger(valor)) {
    throw new RangeError(`${nombre} debe ser un entero válido (recibido: ${valor})`);
  }
  return BigInt(valor);
}

function aNumero(valor: bigint): number {
  const n = Number(valor);
  if (!Number.isSafeInteger(n)) throw new RangeError('Monto fuera de rango');
  return n;
}

/** Regla de tres con un solo redondeo: `valor × numerador ÷ denominador`. */
export function proporcional(valor: number, numerador: number, denominador: number): number {
  return aNumero(dividir(aBig(valor, 'valor') * aBig(numerador, 'numerador'), aBig(denominador, 'denominador')));
}

export function usdABs(monto: Centavos, tasa: Tasa4): Centimos {
  return aNumero(dividir(aBig(monto, 'monto') * aBig(tasa, 'tasa'), 10_000n));
}

export function bsAUsd(monto: Centimos, tasa: Tasa4): Centavos {
  if (tasa <= 0) throw new RangeError('La tasa debe ser mayor que cero');
  return aNumero(dividir(aBig(monto, 'monto') * 10_000n, aBig(tasa, 'tasa')));
}

/** Precio unitario × cantidad, en la misma moneda y escala del precio. */
export function multiplicarCantidad(precio: number, cantidad: Milesimas): number {
  return aNumero(dividir(aBig(precio, 'precio') * aBig(cantidad, 'cantidad'), 1_000n));
}

/** Subtotal en Bs de un precio en USD, con un solo redondeo al final. */
export function subtotalUsdEnBs(precio: Centavos, cantidad: Milesimas, tasa: Tasa4): Centimos {
  const producto = aBig(precio, 'precio') * aBig(cantidad, 'cantidad') * aBig(tasa, 'tasa');
  return aNumero(dividir(producto, 10_000_000n));
}

/** Tasa con el ajuste porcentual del negocio aplicado (D9). */
export function aplicarAjuste(tasa: Tasa4, ajuste: Centesimas): Tasa4 {
  if (ajuste === 0) return tasa;
  return aNumero(dividir(aBig(tasa, 'tasa') * (10_000n + aBig(ajuste, 'ajuste')), 10_000n));
}

/** Redondea un monto en Bs al múltiplo de `paso` (D6). */
export function redondearAPaso(monto: Centimos, paso: Centimos, modo: ModoRedondeo = 'cercano'): Centimos {
  if (paso <= 1) return monto;
  const m = aBig(monto, 'monto');
  const p = aBig(paso, 'paso');
  if (modo === 'cercano') return aNumero(dividir(m, p) * p);
  let q = m / p;
  const r = m % p;
  if (modo === 'arriba' && r > 0n) q += 1n;
  if (modo === 'abajo' && r < 0n) q -= 1n;
  return aNumero(q * p);
}

/** Costo promedio ponderado tras una entrada de mercancía (D7, DISENO.md §6.5). */
export function costoPromedio(
  stockActual: Milesimas,
  costoActual: Diezmilesimas,
  cantidadEntrada: Milesimas,
  costoEntrada: Diezmilesimas,
): Diezmilesimas {
  if (cantidadEntrada <= 0) throw new RangeError('La cantidad de entrada debe ser positiva');
  if (stockActual <= 0) return costoEntrada;
  const s = aBig(stockActual, 'stock');
  const c = aBig(cantidadEntrada, 'cantidad');
  const total = s * aBig(costoActual, 'costo') + c * aBig(costoEntrada, 'costo de entrada');
  return aNumero(dividir(total, s + c));
}

export function centavosADiezmilesimas(monto: Centavos): Diezmilesimas {
  return monto * 100;
}

export function diezmilesimasACentavos(monto: Diezmilesimas): Centavos {
  return aNumero(dividir(aBig(monto, 'monto'), 100n));
}

/** Margen sobre el precio de venta, en centésimas de porcentaje. `null` si el precio es cero. */
export function margenSobreVenta(precio: Centavos, costo: Diezmilesimas): Centesimas | null {
  if (precio <= 0) return null;
  const precio4 = aBig(precio, 'precio') * 100n;
  return aNumero(dividir((precio4 - aBig(costo, 'costo')) * 10_000n, precio4));
}

// ── Formato ────────────────────────────────────────────────────────────────

/**
 * Formatea un entero escalado con convención venezolana: `1.234,56`.
 * Si `decimales` es menor que la escala, redondea.
 */
export function formatearDecimal(valor: number, escala: number, decimales = escala): string {
  let v = aBig(valor, 'valor');
  if (decimales < escala) v = dividir(v, 10n ** BigInt(escala - decimales));
  const negativo = v < 0n;
  if (negativo) v = -v;
  const texto = v.toString().padStart(decimales + 1, '0');
  const entero = decimales > 0 ? texto.slice(0, -decimales) : texto;
  const fraccion = decimales > 0 ? texto.slice(-decimales) : '';
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negativo ? '-' : '') + conMiles + (fraccion ? ',' + fraccion : '');
}

export function formatearUsd(monto: Centavos): string {
  return '$ ' + formatearDecimal(monto, ESCALA.centavos);
}

/** `Bs 1.112` si el monto es entero; `Bs 1.111,50` si tiene céntimos. */
export function formatearBs(monto: Centimos): string {
  return 'Bs ' + formatearDecimal(monto, ESCALA.centimos, monto % 100 === 0 ? 0 : ESCALA.centimos);
}

export function formatearTasa(tasa: Tasa4): string {
  return formatearDecimal(tasa, ESCALA.tasa);
}

export function formatearPorcentaje(valor: Centesimas): string {
  return formatearDecimal(valor, ESCALA.centesimas) + ' %';
}

/** Costo unitario en USD; muestra 4 decimales solo si hacen falta. */
export function formatearCosto(costo: Diezmilesimas): string {
  return '$ ' + (costo % 100 === 0 ? formatearDecimal(costo, 4, 2) : formatearDecimal(costo, 4));
}

/** Cantidad sin ceros sobrantes: `3`, `2,5`, `0,25 kg`. */
export function formatearCantidad(cantidad: Milesimas, unidad?: 'unidad' | 'kg'): string {
  const texto = formatearDecimal(cantidad, ESCALA.milesimas).replace(/,?0+$/, '');
  return unidad === 'kg' ? `${texto} kg` : texto;
}

/**
 * Valor para precargar un campo editable: sin separador de miles (que al
 * releerse podría confundirse con decimales) y sin ceros sobrantes.
 * `123456, 2` → `1234,56`; `1000000, 3` → `1000`.
 */
export function formatearParaEditar(valor: number, escala: number): string {
  return formatearDecimal(valor, escala)
    .replace(/\./g, '')
    .replace(/,?0+$/, '')
    .replace(/^$/, '0');
}

// ── Lectura de lo que escribe el usuario ───────────────────────────────────

/**
 * Convierte texto escrito por el usuario a un entero en la escala pedida.
 * Devuelve `null` si el texto no es un número válido.
 *
 * Reglas de separadores (convención venezolana con tolerancia al punto decimal):
 * - Si hay coma, la coma es el decimal y los puntos son de miles: `1.234,56`.
 * - Si hay varios puntos, son de miles: `1.234.567`.
 * - Un único punto es decimal (`1.25`), salvo en montos de escala ≤ 2 cuando
 *   le siguen exactamente 3 dígitos: `1.500` son mil quinientos.
 * - Los decimales que sobran se redondean.
 */
export function parsearDecimal(
  texto: string,
  escala: number,
  opciones: { permitirNegativo?: boolean } = {},
): number | null {
  let t = texto.trim().replace(/^(\$|bs\.?|usd)\s*/i, '').replace(/\s*(\$|bs\.?|usd)$/i, '');
  t = t.replace(/\s/g, '');
  let negativo = false;
  if (t.startsWith('-')) {
    if (!opciones.permitirNegativo) return null;
    negativo = true;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

  let entero: string;
  let fraccion = '';
  const comas = (t.match(/,/g) ?? []).length;
  const puntos = (t.match(/\./g) ?? []).length;

  if (comas > 1) return null;
  if (comas === 1) {
    const [a = '', b = ''] = t.split(',');
    if (b.includes('.')) return null;
    if (puntos > 0 && !/^\d{1,3}(\.\d{3})+$/.test(a)) return null;
    entero = a.replace(/\./g, '');
    fraccion = b;
  } else if (puntos > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return null;
    entero = t.replace(/\./g, '');
  } else if (puntos === 1) {
    const [a = '', b = ''] = t.split('.');
    if (escala <= 2 && b.length === 3 && a.length > 0) {
      entero = a + b;
    } else {
      entero = a;
      fraccion = b;
    }
  } else {
    entero = t;
  }

  if (entero === '') entero = '0';
  // Se toma un dígito extra de la fracción para redondear.
  const fraccionCompleta = (fraccion + '0'.repeat(escala + 1)).slice(0, escala + 1);
  const crudo = BigInt(entero + fraccionCompleta);
  const valor = dividir(crudo, 10n);
  const resultado = Number(negativo ? -valor : valor);
  return Number.isSafeInteger(resultado) ? resultado : null;
}
