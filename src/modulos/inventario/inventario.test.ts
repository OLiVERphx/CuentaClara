import { beforeEach, describe, expect, it } from 'vitest';
import { guardarDispositivo } from '../../core/config/config';
import { db } from '../../core/db/db';
import { nuevoRegistro } from '../../core/db/registro';
import { ErrorNegocio, ErrorPermiso } from '../../core/errores';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { IndiceProductos } from './busqueda';
import { decodificar, detectarSeparador, generarPlantilla, parsearCsv, validarCsv } from './csv';
import { costoPorUnidad, enBs, estadoStock, nuevoPrecio, precioEnBs, precioPresentacion, precioSugerido, subtotalEnBs } from './precios';
import {
  actualizarProducto,
  ajustarPrecios,
  crearCategoria,
  crearProducto,
  importarProductos,
  listarMovimientos,
  obtenerCatalogo,
  registrarAjuste,
  registrarConteo,
  type DatosProducto,
} from './servicio';
import type { Producto } from './tipos';

const base: DatosProducto = {
  codigo: '',
  codigoBarras: '',
  nombre: 'Harina P.A.N. 1 kg',
  categoriaId: null,
  unidad: 'unidad',
  monedaPrecio: 'USD',
  precio: 125,
  costoPromedio: 9500,
  stockMinimo: 6000,
  activo: true,
};

describe('precios', () => {
  it('convierte según la moneda del producto', () => {
    expect(enBs(125, 'USD', 8_895_754)).toBe(111_197);
    expect(enBs(150_000, 'VES', 8_895_754)).toBe(150_000);
  });

  it('redondea el precio en Bs al paso del negocio y no toca los precios fijos en Bs', () => {
    const alBolivar = { paso: 100, modo: 'cercano' as const };
    expect(precioEnBs(125, 'USD', 8_895_754, alBolivar)).toBe(111_200); // 1.111,97 → 1.112
    expect(precioEnBs(150_050, 'VES', 8_895_754, alBolivar)).toBe(150_050);
    expect(precioEnBs(125, 'USD', 8_895_754, { paso: 1000, modo: 'arriba' })).toBe(112_000);
    expect(precioEnBs(125, 'USD', 8_895_754, { paso: 1, modo: 'cercano' })).toBe(111_197);
  });

  it('el subtotal parte del precio redondeado: el cliente paga lo que ve', () => {
    const alBolivar = { paso: 100, modo: 'cercano' as const };
    const harina = precioEnBs(125, 'USD', 8_895_754, alBolivar);
    expect(subtotalEnBs(harina, 1000, alBolivar)).toBe(harina);
    expect(subtotalEnBs(harina, 3000, alBolivar)).toBe(333_600); // 3 × 1.112
    // Queso a $8/kg → Bs 7.117/kg; 0,350 kg → 2.490,95 → Bs 2.491
    const queso = precioEnBs(800, 'USD', 8_895_754, alBolivar);
    expect(queso).toBe(711_700);
    expect(subtotalEnBs(queso, 350, alBolivar)).toBe(249_100);
  });

  it('calcula precios nuevos por porcentaje o por margen', () => {
    const p = { precio: 125, costoPromedio: 10_000, monedaPrecio: 'USD' as const };
    expect(nuevoPrecio(p, { tipo: 'porcentaje', centesimas: 1000 }, 1)).toBe(138); // +10 % = 1,375 → hacia arriba
    expect(nuevoPrecio(p, { tipo: 'porcentaje', centesimas: 1000 }, 5)).toBe(140); // a $0,05
    expect(nuevoPrecio(p, { tipo: 'porcentaje', centesimas: -2000 }, 1)).toBe(100);
    expect(nuevoPrecio(p, { tipo: 'margen', centesimas: 2000 }, 1)).toBe(125); // $1 ÷ 0,8
    expect(nuevoPrecio(p, { tipo: 'margen', centesimas: 3000 }, 5)).toBe(145); // 1,4286 → 1,45
    expect(nuevoPrecio({ ...p, costoPromedio: 0 }, { tipo: 'margen', centesimas: 2000 }, 1)).toBeNull();
    expect(nuevoPrecio({ ...p, monedaPrecio: 'VES' }, { tipo: 'margen', centesimas: 2000 }, 1)).toBeNull();
    expect(nuevoPrecio(p, { tipo: 'margen', centesimas: 10_000 }, 1)).toBeNull();
  });

  it('saca el costo de cada unidad a partir del empaque', () => {
    // Paquete de 50 caramelos a $2 → $0,04 c/u
    expect(costoPorUnidad(200, 'USD', 50_000, null)).toBe(400);
    // El mismo paquete pagado en Bs 1.779,15 con tasa 889,5754
    expect(costoPorUnidad(177_915, 'VES', 50_000, 8_895_754)).toBe(400);
    // Saco de 50 kg a $45 → $0,90 el kilo
    expect(costoPorUnidad(4500, 'USD', 50_000, null)).toBe(9000);
    expect(costoPorUnidad(177_915, 'VES', 50_000, null)).toBeNull(); // sin tasa
    expect(costoPorUnidad(200, 'USD', 0, null)).toBeNull();
  });

  it('sugiere un precio de venta para el margen pedido', () => {
    const alBolivar = { paso: 100, modo: 'cercano' as const };
    expect(precioSugerido(400, 3000, 'USD', null, alBolivar)).toBe(6); // $0,04 ÷ 0,7 = 0,0571 → $0,06
    expect(precioSugerido(10_000, 2000, 'USD', null, alBolivar)).toBe(125);
    // En Bs fijo: $0,04 = Bs 35,58 → ÷ 0,7 = 50,83 → Bs 51
    expect(precioSugerido(400, 3000, 'VES', 8_895_754, alBolivar)).toBe(5100);
    expect(precioSugerido(400, 3000, 'VES', null, alBolivar)).toBeNull();
    expect(precioSugerido(0, 3000, 'USD', null, alBolivar)).toBeNull();
    expect(precioSugerido(400, 10_000, 'USD', null, alBolivar)).toBeNull();
  });

  it('calcula el precio de una presentación', () => {
    expect(precioPresentacion({ precio: 125 }, { precio: null, factor: 24_000 })).toBe(3000);
    expect(precioPresentacion({ precio: 125 }, { precio: 2800, factor: 24_000 })).toBe(2800);
    expect(precioPresentacion({ precio: 800 }, { precio: null, factor: 500 })).toBe(400);
  });

  it('clasifica el stock', () => {
    expect(estadoStock({ stock: 0, stockMinimo: 0 })).toBe('agotado');
    expect(estadoStock({ stock: 5000, stockMinimo: 6000 })).toBe('bajo');
    expect(estadoStock({ stock: 7000, stockMinimo: 6000 })).toBe('normal');
    expect(estadoStock({ stock: 1000, stockMinimo: 0 })).toBe('normal');
  });
});

describe('servicio de inventario', () => {
  beforeEach(async () => {
    await reiniciarBase();
    await guardarDispositivo({ id: 'laptop', nombre: 'Laptop', prefijo: 'L' });
    sesionDePrueba();
  });

  it('crea un producto con código automático, stock inicial y kardex', async () => {
    const p = await crearProducto(base, [], 24_000);
    expect(p.codigo).toBe('L0001');
    expect(p.stock).toBe(24_000);
    expect(p.nombreNormalizado).toBe('harina pan 1 kg');
    const movs = await listarMovimientos(p.id);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'inventario_inicial', cantidad: 24_000, stockResultante: 24_000 });
    expect((await crearProducto({ ...base, nombre: 'Arroz' })).codigo).toBe('L0002');
  });

  it('el cajero no puede crear productos', async () => {
    sesionDePrueba('cajero');
    await expect(crearProducto(base)).rejects.toThrow(ErrorPermiso);
  });

  it('valida nombre, precio y fracciones', async () => {
    await expect(crearProducto({ ...base, nombre: '  ' })).rejects.toThrow('nombre');
    await expect(crearProducto({ ...base, precio: -1 })).rejects.toThrow('precio');
    await expect(crearProducto(base, [], 1500)).rejects.toThrow('fracciones');
    await expect(crearProducto({ ...base, unidad: 'kg' }, [], 1500)).resolves.toMatchObject({ stock: 1500 });
  });

  it('no permite códigos ni códigos de barras repetidos', async () => {
    await crearProducto({ ...base, codigo: 'h1', codigoBarras: '7591' });
    await expect(crearProducto({ ...base, codigo: 'H1' })).rejects.toThrow('ya lo usa');
    await expect(crearProducto({ ...base, codigoBarras: '7591' })).rejects.toThrow('ya lo usa');
    await expect(
      crearProducto(base, [{ nombre: 'Bulto', factor: 20_000, precio: null, codigoBarras: '7591', paraVenta: true, paraCompra: true }]),
    ).rejects.toThrow('ya lo usa');
  });

  it('sincroniza presentaciones al editar', async () => {
    const p = await crearProducto(base, [
      { nombre: 'Bulto x20', factor: 20_000, precio: null, codigoBarras: '', paraVenta: false, paraCompra: true },
      { nombre: 'Media docena', factor: 6000, precio: 700, codigoBarras: '', paraVenta: true, paraCompra: false },
    ]);
    const { presentaciones } = await obtenerCatalogo();
    const bulto = presentaciones.find((x) => x.nombre === 'Bulto x20')!;
    await actualizarProducto(p.id, { ...base, precio: 130 }, [
      { id: bulto.id, nombre: 'Bulto x20', factor: 20_000, precio: 2400, codigoBarras: '', paraVenta: true, paraCompra: true },
    ]);
    const despues = (await obtenerCatalogo()).presentaciones;
    expect(despues).toHaveLength(1);
    expect(despues[0]).toMatchObject({ id: bulto.id, precio: 2400, version: 2 });
    const auditoria = await db.auditoria.where('entidad').equals('producto').toArray();
    expect(auditoria.at(-1)).toMatchObject({ accion: 'modificar', antes: { precio: 125 }, despues: { precio: 130 } });
  });

  it('el stock no se edita a mano: actualizarProducto lo conserva', async () => {
    const p = await crearProducto(base, [], 10_000);
    const editado = await actualizarProducto(p.id, { ...base, nombre: 'Harina PAN' }, []);
    expect(editado.stock).toBe(10_000);
  });

  it('registra mermas y bloquea sacar más de lo que hay', async () => {
    const p = await crearProducto(base, [], 10_000);
    await expect(registrarAjuste({ productoId: p.id, tipo: 'merma', cantidad: 2000, motivo: '' })).rejects.toThrow('motivo');
    const r = await registrarAjuste({ productoId: p.id, tipo: 'merma', cantidad: 2000, motivo: 'Paquetes rotos' });
    expect(r.stock).toBe(8000);
    await expect(registrarAjuste({ productoId: p.id, tipo: 'consumo_propio', cantidad: 9000, motivo: 'casa' })).rejects.toThrow(
      'conteo físico',
    );
  });

  it('una entrada con costo recalcula el costo promedio', async () => {
    const p = await crearProducto({ ...base, costoPromedio: 10_000 }, [], 10_000);
    const r = await registrarAjuste({ productoId: p.id, tipo: 'ajuste_positivo', cantidad: 10_000, costoUnitario: 12_000, motivo: 'Compra al mayor' });
    expect(r.costoPromedio).toBe(11_000);
    expect(r.stock).toBe(20_000);
  });

  it('el conteo físico registra solo la diferencia', async () => {
    const p = await crearProducto(base, [], 10_000);
    const r = await registrarConteo(p.id, 7000);
    expect(r.stock).toBe(7000);
    const [ultimo] = await listarMovimientos(p.id, 1);
    expect(ultimo).toMatchObject({ tipo: 'ajuste_negativo', cantidad: -3000, motivo: 'Conteo físico: 7' });
    await expect(registrarConteo(p.id, 7000)).rejects.toThrow(ErrorNegocio);
  });

  it('el ajuste masivo cambia precios y escala las presentaciones con precio propio', async () => {
    const p = await crearProducto(base, [
      { nombre: 'Bulto x20', factor: 20_000, precio: 2400, codigoBarras: '', paraVenta: true, paraCompra: true },
      { nombre: 'Media docena', factor: 6000, precio: null, codigoBarras: '', paraVenta: true, paraCompra: false },
    ]);
    expect(await ajustarPrecios([{ productoId: p.id, precio: 150 }], 'Aumento del proveedor')).toBe(1);
    const { productos, presentaciones } = await obtenerCatalogo();
    expect(productos[0]!.precio).toBe(150);
    expect(presentaciones.find((x) => x.nombre === 'Bulto x20')!.precio).toBe(2880); // +20 %
    expect(presentaciones.find((x) => x.nombre === 'Media docena')!.precio).toBeNull();
    sesionDePrueba('cajero');
    await expect(ajustarPrecios([{ productoId: p.id, precio: 200 }], 'x')).rejects.toThrow(ErrorPermiso);
  });

  it('las categorías no se duplican por mayúsculas o acentos', async () => {
    const a = await crearCategoria('Víveres');
    const b = await crearCategoria('  viveres ');
    expect(b.id).toBe(a.id);
  });

  it('importa en bloque con categorías y stock', async () => {
    const texto = generarPlantilla();
    const { validas, errores } = validarCsv(texto, { codigos: new Set(), barras: new Set() });
    expect(errores).toEqual([]);
    expect(await importarProductos(validas)).toBe(3);
    const { productos, categorias } = await obtenerCatalogo();
    expect(categorias.map((c) => c.nombre)).toEqual(['Charcutería', 'Panadería', 'Víveres']);
    const queso = productos.find((p) => p.nombre === 'Queso blanco duro')!;
    expect(queso).toMatchObject({ unidad: 'kg', stock: 3500, precio: 800, costoPromedio: 65_000 });
    const pan = productos.find((p) => p.nombre === 'Pan campesino')!;
    expect(pan).toMatchObject({ monedaPrecio: 'VES', precio: 150_000 });
  });
});

describe('CSV', () => {
  it('detecta el separador y respeta las comillas', () => {
    expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarSeparador('a,b,c')).toBe(',');
    expect(parsearCsv('nombre;precio\r\n"Queso; blanco";"8,00"\r\n"Dice ""hola""";1\r\n\r\n')).toEqual([
      ['nombre', 'precio'],
      ['Queso; blanco', '8,00'],
      ['Dice "hola"', '1'],
    ]);
  });

  it('lee archivos de Excel en Windows-1252', () => {
    const bytes = new Uint8Array([0x56, 0xed, 0x76, 0x65, 0x72, 0x65, 0x73]); // "Víveres" en Windows-1252
    expect(decodificar(bytes.buffer)).toBe('Víveres');
    expect(decodificar(new TextEncoder().encode('﻿Víveres').buffer as ArrayBuffer)).toBe('Víveres');
  });

  it('reporta errores por fila sin detener las válidas', () => {
    const texto = [
      'Nombre;Precio USD;Unidad;Stock;Código;Columna rara',
      'Arroz;1,10;unidad;10;A1;x',
      ';1;unidad;1;;',
      'Queso;abc;kg;1;;',
      'Azúcar;1;litro;1;;',
      'Caraotas;2;unidad;2,5;;',
      'Pasta;1;unidad;1;A1;',
      'Aceite;3;unidad;1;EXISTE;',
    ].join('\n');
    const r = validarCsv(texto, { codigos: new Set(['EXISTE']), barras: new Set() });
    expect(r.validas.map((v) => v.datos.nombre)).toEqual(['Arroz']);
    expect(r.columnasIgnoradas).toEqual(['Columna rara']);
    expect(r.errores.map((e) => e.fila)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(r.errores[0]!.mensaje).toContain('nombre');
    expect(r.errores[4]!.mensaje).toContain('repetido');
    expect(r.errores[5]!.mensaje).toContain('ya existe');
  });

  it('exige las columnas nombre y precio', () => {
    const r = validarCsv('codigo;stock\nA;1', { codigos: new Set(), barras: new Set() });
    expect(r.errores.map((e) => e.mensaje)).toEqual(['Falta la columna obligatoria "nombre".', 'Falta la columna obligatoria "precio".']);
  });
});

describe('búsqueda', () => {
  function producto(nombre: string, extra: Partial<Producto> = {}): Producto {
    return nuevoRegistro({
      codigo: extra.codigo ?? nombre.slice(0, 3).toUpperCase(),
      codigoBarras: null,
      nombre,
      nombreNormalizado: nombre.toLowerCase(),
      categoriaId: null,
      unidad: 'unidad' as const,
      monedaPrecio: 'USD' as const,
      precio: 100,
      costoPromedio: 0,
      stock: 1000,
      stockMinimo: 0,
      activo: true,
      ...extra,
    });
  }

  it('encuentra por palabras parciales, sin acentos ni puntos', () => {
    const indice = new IndiceProductos();
    indice.cargar(
      [producto('Harina P.A.N. 1kg', { nombreNormalizado: 'harina pan 1kg' }), producto('Harina de trigo'), producto('Panela')],
      [],
      [],
    );
    expect(indice.buscar('har pan').map((r) => r.producto.nombre)).toEqual(['Harina P.A.N. 1kg']);
    expect(indice.buscar('HARINA').length).toBe(2);
    expect(indice.buscar('pan')[0]!.producto.nombre).toBe('Panela');
    expect(indice.buscar('   ')).toEqual([]);
  });

  it('prioriza el código exacto y encuentra presentaciones por código de barras', () => {
    const indice = new IndiceProductos();
    const harina = producto('Harina', { codigo: 'L0001', codigoBarras: '759100' });
    const bulto = nuevoRegistro({ productoId: harina.id, nombre: 'Bulto', factor: 20_000, precio: null, codigoBarras: '759999', paraVenta: true, paraCompra: true });
    indice.cargar([harina, producto('Otro L0001x', { codigo: 'X' })], [bulto], []);
    expect(indice.buscar('l0001')[0]!.producto.id).toBe(harina.id);
    const porBarras = indice.buscar('759999');
    expect(porBarras[0]!.presentacionExacta?.id).toBe(bulto.id);
  });

  it('crear una categoría con productos ya cargados no se cuelga y la hace buscable', () => {
    // Regresión: al crear «Bebidas» con productos en el índice, la app se congelaba.
    const indice = new IndiceProductos();
    const coca = producto('Coca-Cola 1.5L');
    indice.cargar([coca, producto('Harina'), producto('Arroz')], [], []);
    const bebidas = nuevoRegistro({ nombre: 'Bebidas', nombreNormalizado: 'bebidas' });
    indice.actualizarCategorias([bebidas]);
    expect(indice.tamano).toBe(3);
    indice.poner({ ...coca, categoriaId: bebidas.id }, []);
    expect(indice.buscar('bebidas').map((r) => r.producto.nombre)).toEqual(['Coca-Cola 1.5L']);
  });

  it('oculta inactivos salvo que se pidan y busca por categoría', () => {
    const indice = new IndiceProductos();
    const cat = nuevoRegistro({ nombre: 'Charcutería', nombreNormalizado: 'charcuteria' });
    indice.cargar([producto('Queso', { categoriaId: cat.id }), producto('Jamón viejo', { activo: false })], [], [cat]);
    expect(indice.buscar('charcu').map((r) => r.producto.nombre)).toEqual(['Queso']);
    expect(indice.buscar('jamon')).toEqual([]);
    expect(indice.buscar('jamon', { incluirInactivos: true })).toHaveLength(1);
  });

  it('responde en menos de 50 ms con 20.000 productos', () => {
    const palabras = ['harina', 'arroz', 'pasta', 'aceite', 'azucar', 'cafe', 'leche', 'queso', 'jabon', 'atun'];
    const marcas = ['pan', 'mary', 'primor', 'vatel', 'montalban', 'polar', 'nestle', 'ricos', 'fama', 'gloria'];
    const productos: Producto[] = [];
    for (let i = 0; i < 20_000; i++) {
      const nombre = `${palabras[i % 10]} ${marcas[Math.floor(i / 10) % 10]} ${i}`;
      productos.push(producto(nombre, { codigo: `P${i}`, nombreNormalizado: nombre }));
    }
    const indice = new IndiceProductos();
    indice.cargar(productos, [], []);
    indice.buscar('harina'); // calentamiento
    const inicio = performance.now();
    for (const q of ['har pan', 'queso', 'atun gl', 'cafe 1999', 'xyz']) indice.buscar(q);
    const promedio = (performance.now() - inicio) / 5;
    expect(promedio).toBeLessThan(50);
  });
});
