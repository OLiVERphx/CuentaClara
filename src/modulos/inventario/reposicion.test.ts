import { describe, expect, it } from 'vitest';
import { nuevoRegistro } from '../../core/db/registro';
import { contarPorReponer, sugerirReposicion } from './reposicion';
import type { Presentacion, Producto } from './tipos';

function producto(nombre: string, extra: Partial<Producto>): Producto {
  return nuevoRegistro({
    codigo: nombre,
    codigoBarras: null,
    nombre,
    nombreNormalizado: nombre.toLowerCase(),
    categoriaId: null,
    unidad: 'unidad' as const,
    monedaPrecio: 'USD' as const,
    precio: 100,
    costoPromedio: 0,
    stock: 0,
    stockMinimo: 0,
    activo: true,
    ...extra,
  });
}

describe('reposición', () => {
  const harina = producto('Harina', { stock: 4000, stockMinimo: 6000 });
  const arroz = producto('Arroz', { stock: 0 });
  const azucar = producto('Azúcar', { stock: 5000 });
  const sal = producto('Sal', { stock: 50_000, stockMinimo: 2000 });
  const queso = producto('Queso', { unidad: 'kg', stock: 300, stockMinimo: 1000 });
  const bulto: Presentacion = nuevoRegistro({ productoId: harina.id, nombre: 'Bulto x20', factor: 20_000, precio: null, codigoBarras: null, paraVenta: false, paraCompra: true });

  const vendidos = new Map([
    [harina.id, 28_000], // 2 por día
    [arroz.id, 14_000], // 1 por día
    [azucar.id, 28_000], // 2 por día: 5 alcanzan 2 días
    [sal.id, 14_000],
  ]);

  const r = sugerirReposicion([harina, arroz, azucar, sal, queso], new Map([[harina.id, [bulto]]]), vendidos);

  it('incluye agotados, bajos y los que se acaban, en ese orden', () => {
    expect(r.map((s) => [s.producto.nombre, s.motivo])).toEqual([
      ['Arroz', 'agotado'],
      ['Harina', 'bajo'],
      ['Queso', 'bajo'],
      ['Azúcar', 'se_acaba'],
    ]);
  });

  it('pide una semana de ventas o el doble del mínimo, redondeado a la presentación', () => {
    const h = r.find((s) => s.producto.nombre === 'Harina')!;
    // objetivo = max(12, 14) = 14; faltan 10 → 1 bulto de 20
    expect(h).toMatchObject({ consumoDiario: 2000, diasQueAlcanza: 2, sugerido: 1, sugeridoBase: 20_000 });
    expect(r.find((s) => s.producto.nombre === 'Arroz')).toMatchObject({ sugerido: 7000 });
    // Queso por kilo: objetivo 2 kg, faltan 1,7 → 2 kg (medio kilo hacia arriba)
    expect(r.find((s) => s.producto.nombre === 'Queso')).toMatchObject({ sugeridoBase: 2000, diasQueAlcanza: null });
  });

  it('cuenta los que necesitan reposición', () => {
    expect(contarPorReponer([harina, arroz, azucar, sal, queso])).toBe(3);
  });
});
