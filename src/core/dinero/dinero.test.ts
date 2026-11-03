import { describe, expect, it } from 'vitest';
import {
  aplicarAjuste,
  bsAUsd,
  costoPromedio,
  dividir,
  formatearBs,
  formatearCantidad,
  formatearCosto,
  formatearDecimal,
  formatearParaEditar,
  formatearTasa,
  formatearUsd,
  margenSobreVenta,
  multiplicarCantidad,
  parsearDecimal,
  redondearAPaso,
  subtotalUsdEnBs,
  usdABs,
} from './dinero';

describe('dividir', () => {
  it('redondea la mitad lejos de cero', () => {
    expect(dividir(5n, 2n)).toBe(3n);
    expect(dividir(-5n, 2n)).toBe(-3n);
    expect(dividir(4n, 3n)).toBe(1n);
    expect(dividir(5n, 3n)).toBe(2n);
    expect(dividir(-4n, 3n)).toBe(-1n);
    expect(dividir(7n, -2n)).toBe(-4n);
  });

  it('rechaza dividir entre cero', () => {
    expect(() => dividir(1n, 0n)).toThrow(RangeError);
  });
});

describe('conversión USD ↔ Bs', () => {
  const tasa = 8_895_754; // 889,5754 Bs/USD

  it('convierte USD a Bs', () => {
    expect(usdABs(100, tasa)).toBe(88_958); // $1,00 → Bs 889,58
    expect(usdABs(125, tasa)).toBe(111_197); // $1,25 → Bs 1.111,97
    expect(usdABs(0, tasa)).toBe(0);
  });

  it('convierte Bs a USD', () => {
    expect(bsAUsd(88_958, tasa)).toBe(100);
    expect(bsAUsd(500_000, tasa)).toBe(562); // Bs 5.000 → $5,62
  });

  it('rechaza tasas inválidas y montos no enteros', () => {
    expect(() => bsAUsd(100, 0)).toThrow(RangeError);
    expect(() => usdABs(1.5, tasa)).toThrow(RangeError);
  });

  it('calcula el subtotal en Bs con un solo redondeo', () => {
    // 0,350 kg de queso a $8,00/kg = $2,80 → Bs 2.490,81
    expect(subtotalUsdEnBs(800, 350, tasa)).toBe(249_081);
    // 3 unidades de $0,01: redondear cada unidad daría Bs 26,70
    expect(subtotalUsdEnBs(1, 3000, tasa)).toBe(2669);
  });

  it('multiplica precio por cantidad', () => {
    expect(multiplicarCantidad(800, 350)).toBe(280);
    expect(multiplicarCantidad(125, 3000)).toBe(375);
    expect(multiplicarCantidad(1000, 24_000)).toBe(24_000);
  });

  it('no desborda con montos grandes', () => {
    // $100.000 × 1.000 unidades × 99.999,9999 Bs/USD: el producto intermedio supera 2^53
    expect(subtotalUsdEnBs(10_000_000, 1_000_000, 999_999_999)).toBe(999_999_999_000_000);
  });
});

describe('ajuste sobre la tasa', () => {
  it('aplica el porcentaje', () => {
    expect(aplicarAjuste(1_000_000, 0)).toBe(1_000_000);
    expect(aplicarAjuste(1_000_000, 250)).toBe(1_025_000); // +2,5 %
    expect(aplicarAjuste(8_895_754, 500)).toBe(9_340_542); // +5 %
  });
});

describe('redondearAPaso', () => {
  it('redondea al bolívar entero más cercano', () => {
    expect(redondearAPaso(111_197, 100)).toBe(111_200);
    expect(redondearAPaso(111_149, 100)).toBe(111_100);
    expect(redondearAPaso(111_150, 100)).toBe(111_200);
  });

  it('respeta otros pasos y modos', () => {
    expect(redondearAPaso(111_197, 50)).toBe(111_200);
    expect(redondearAPaso(111_120, 50)).toBe(111_100);
    expect(redondearAPaso(111_101, 1000, 'arriba')).toBe(112_000);
    expect(redondearAPaso(111_999, 1000, 'abajo')).toBe(111_000);
    expect(redondearAPaso(111_000, 1000, 'arriba')).toBe(111_000);
  });

  it('con paso 1 o menor no cambia el monto', () => {
    expect(redondearAPaso(111_197, 1)).toBe(111_197);
    expect(redondearAPaso(111_197, 0)).toBe(111_197);
  });
});

describe('costoPromedio', () => {
  it('pondera por cantidad', () => {
    // 10 unidades a $1,00 + 10 a $1,20 → $1,10
    expect(costoPromedio(10_000, 10_000, 10_000, 12_000)).toBe(11_000);
    // 30 a $1,00 + 10 a $2,00 → $1,25
    expect(costoPromedio(30_000, 10_000, 10_000, 20_000)).toBe(12_500);
  });

  it('usa el costo de entrada si no había stock', () => {
    expect(costoPromedio(0, 10_000, 5000, 12_000)).toBe(12_000);
    expect(costoPromedio(-2000, 10_000, 5000, 12_000)).toBe(12_000);
  });

  it('rechaza entradas no positivas', () => {
    expect(() => costoPromedio(1000, 1, 0, 1)).toThrow(RangeError);
  });
});

describe('margenSobreVenta', () => {
  it('calcula el margen en centésimas', () => {
    expect(margenSobreVenta(125, 10_000)).toBe(2000); // vende $1,25, cuesta $1,00 → 20 %
    expect(margenSobreVenta(100, 12_000)).toBe(-2000);
    expect(margenSobreVenta(0, 100)).toBeNull();
  });
});

describe('formato venezolano', () => {
  it('formatea con punto de miles y coma decimal', () => {
    expect(formatearDecimal(123_456_789, 2)).toBe('1.234.567,89');
    expect(formatearDecimal(5, 2)).toBe('0,05');
    expect(formatearDecimal(-150, 2)).toBe('-1,50');
    expect(formatearDecimal(12_345, 4, 2)).toBe('1,23');
    expect(formatearDecimal(1000, 0)).toBe('1.000');
  });

  it('formatea monedas, tasa y costo', () => {
    expect(formatearUsd(125)).toBe('$ 1,25');
    expect(formatearBs(111_197)).toBe('Bs 1.111,97');
    expect(formatearBs(111_200)).toBe('Bs 1.112');
    expect(formatearBs(111_150)).toBe('Bs 1.111,50');
    expect(formatearTasa(8_895_754)).toBe('889,5754');
    expect(formatearCosto(12_500)).toBe('$ 1,25');
    expect(formatearCosto(4167)).toBe('$ 0,4167');
  });

  it('formatea cantidades sin ceros sobrantes', () => {
    expect(formatearCantidad(3000)).toBe('3');
    expect(formatearCantidad(2500)).toBe('2,5');
    expect(formatearCantidad(250, 'kg')).toBe('0,25 kg');
    expect(formatearCantidad(100_000)).toBe('100');
    expect(formatearCantidad(1_000_000)).toBe('1.000');
  });
});

describe('formatearParaEditar', () => {
  it('no usa separador de miles y se relee igual', () => {
    expect(formatearParaEditar(123_456, 2)).toBe('1234,56');
    expect(formatearParaEditar(1_000_000, 3)).toBe('1000');
    expect(formatearParaEditar(2500, 3)).toBe('2,5');
    expect(formatearParaEditar(9500, 4)).toBe('0,95');
    expect(formatearParaEditar(0, 2)).toBe('0');
    for (const [valor, escala] of [[1_000_000, 3], [123_456, 2], [8_895_754, 4], [150_000, 2]] as const) {
      expect(parsearDecimal(formatearParaEditar(valor, escala), escala)).toBe(valor);
    }
  });
});

describe('parsearDecimal', () => {
  it('lee la convención venezolana', () => {
    expect(parsearDecimal('1.234,56', 2)).toBe(123_456);
    expect(parsearDecimal('1,25', 2)).toBe(125);
    expect(parsearDecimal('0,5', 2)).toBe(50);
    expect(parsearDecimal(',5', 2)).toBe(50);
    expect(parsearDecimal('1.234.567', 2)).toBe(123_456_700);
  });

  it('acepta el punto decimal del teclado numérico', () => {
    expect(parsearDecimal('1.25', 2)).toBe(125);
    expect(parsearDecimal('889.5754', 4)).toBe(8_895_754);
    expect(parsearDecimal('0.350', 3)).toBe(350);
  });

  it('interpreta un punto seguido de 3 dígitos como miles en montos', () => {
    expect(parsearDecimal('1.500', 2)).toBe(150_000);
    expect(parsearDecimal('1.500', 3)).toBe(1500);
  });

  it('ignora símbolos de moneda y espacios', () => {
    expect(parsearDecimal('$ 1,25', 2)).toBe(125);
    expect(parsearDecimal('Bs 1.500,00', 2)).toBe(150_000);
    expect(parsearDecimal(' 12 ', 2)).toBe(1200);
  });

  it('redondea los decimales sobrantes', () => {
    expect(parsearDecimal('1,255', 2)).toBe(126);
    expect(parsearDecimal('1,2549', 2)).toBe(125);
  });

  it('rechaza textos inválidos', () => {
    expect(parsearDecimal('', 2)).toBeNull();
    expect(parsearDecimal('abc', 2)).toBeNull();
    expect(parsearDecimal('1,2,3', 2)).toBeNull();
    expect(parsearDecimal('1,234.56', 2)).toBeNull();
    expect(parsearDecimal('12.34.5', 2)).toBeNull();
    expect(parsearDecimal('-5', 2)).toBeNull();
    expect(parsearDecimal('.', 2)).toBeNull();
  });

  it('acepta negativos solo si se pide', () => {
    expect(parsearDecimal('-5', 2, { permitirNegativo: true })).toBe(-500);
  });
});
