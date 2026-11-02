import { ESCALA, parsearDecimal } from '../../core/dinero/dinero';
import { limpiar, normalizar } from '../../core/util/texto';
import type { FilaImportacion } from './servicio';
import type { MonedaPrecio, Unidad } from './tipos';

/**
 * Importación de productos desde CSV (D18). Excel guarda CSV con ";" cuando
 * el sistema usa coma decimal, y en Windows suele usar la codificación
 * Windows-1252; ambas cosas se detectan solas.
 */

const ALIAS_COLUMNAS: Record<string, string> = {
  codigo: 'codigo',
  cod: 'codigo',
  codigo_interno: 'codigo',
  codigo_barras: 'codigo_barras',
  codigo_de_barras: 'codigo_barras',
  barras: 'codigo_barras',
  ean: 'codigo_barras',
  nombre: 'nombre',
  descripcion: 'nombre',
  producto: 'nombre',
  categoria: 'categoria',
  unidad: 'unidad',
  moneda: 'moneda',
  precio: 'precio',
  precio_usd: 'precio',
  precio_venta: 'precio',
  costo: 'costo_usd',
  costo_usd: 'costo_usd',
  stock: 'stock',
  existencia: 'stock',
  cantidad: 'stock',
  stock_minimo: 'stock_minimo',
  minimo: 'stock_minimo',
};

export const COLUMNAS_PLANTILLA = ['codigo', 'codigo_barras', 'nombre', 'categoria', 'unidad', 'moneda', 'precio', 'costo_usd', 'stock', 'stock_minimo'];

export function generarPlantilla(): string {
  const filas = [
    COLUMNAS_PLANTILLA,
    ['', '7591002000011', 'Harina P.A.N. 1 kg', 'Víveres', 'unidad', 'USD', '1,25', '0,95', '24', '6'],
    ['', '', 'Queso blanco duro', 'Charcutería', 'kg', 'USD', '8,00', '6,50', '3,5', '1'],
    ['', '', 'Pan campesino', 'Panadería', 'unidad', 'VES', '1.500,00', '1,20', '10', ''],
  ];
  return '﻿' + filas.map((f) => f.join(';')).join('\r\n') + '\r\n';
}

export function decodificar(bytes: ArrayBuffer): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^﻿/, '');
}

export function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  const candidatos = [';', ',', '\t'].map((c) => ({ c, n: cuenta(c) }));
  candidatos.sort((a, b) => b.n - a.n);
  return candidatos[0]!.n > 0 ? candidatos[0]!.c : ';';
}

/** CSV según RFC 4180: comillas para campos con separadores, "" para una comilla literal. */
export function parsearCsv(texto: string, separador = detectarSeparador(texto)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

export interface ErrorFila {
  /** Número de fila tal como se ve en Excel (la cabecera es la 1). */
  fila: number;
  mensaje: string;
}

export interface ResultadoValidacion {
  validas: (FilaImportacion & { fila: number })[];
  errores: ErrorFila[];
  columnasIgnoradas: string[];
}

export function validarCsv(
  texto: string,
  existentes: { codigos: Set<string>; barras: Set<string> },
): ResultadoValidacion {
  const filas = parsearCsv(texto);
  const errores: ErrorFila[] = [];
  const validas: ResultadoValidacion['validas'] = [];
  if (filas.length === 0) return { validas, errores: [{ fila: 1, mensaje: 'El archivo está vacío.' }], columnasIgnoradas: [] };

  const cabecera = filas[0]!.map((c) => normalizar(c).replace(/ /g, '_'));
  const indices = new Map<string, number>();
  const columnasIgnoradas: string[] = [];
  cabecera.forEach((c, i) => {
    const columna = ALIAS_COLUMNAS[c];
    if (columna && !indices.has(columna)) indices.set(columna, i);
    else if (c) columnasIgnoradas.push(filas[0]![i]!);
  });
  for (const requerida of ['nombre', 'precio']) {
    if (!indices.has(requerida)) {
      errores.push({ fila: 1, mensaje: `Falta la columna obligatoria "${requerida}".` });
    }
  }
  if (errores.length > 0) return { validas, errores, columnasIgnoradas };

  const codigosArchivo = new Set<string>();
  const barrasArchivo = new Set<string>();

  filas.slice(1).forEach((celdas, i) => {
    const numero = i + 2;
    const valor = (columna: string) => limpiar(celdas[indices.get(columna) ?? -1] ?? '');
    const problemas: string[] = [];

    const nombre = valor('nombre');
    if (!nombre) problemas.push('falta el nombre');

    const unidadTexto = normalizar(valor('unidad'));
    let unidad: Unidad = 'unidad';
    if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(unidadTexto)) unidad = 'kg';
    else if (unidadTexto && !['unidad', 'und', 'un', 'u', 'unidades'].includes(unidadTexto)) {
      problemas.push(`unidad "${valor('unidad')}" no reconocida (usa unidad o kg)`);
    }

    const monedaTexto = normalizar(valor('moneda'));
    let moneda: MonedaPrecio = 'USD';
    if (['ves', 'bs', 'bolivares', 'bss'].includes(monedaTexto)) moneda = 'VES';
    else if (monedaTexto && !['usd', 'dolares', 'dolar', '$'].includes(monedaTexto)) {
      problemas.push(`moneda "${valor('moneda')}" no reconocida (usa USD o VES)`);
    }

    const precio = parsearDecimal(valor('precio'), ESCALA.centavos);
    if (precio === null) problemas.push(`precio "${valor('precio')}" no válido`);

    const leerOpcional = (columna: string, escala: number, nombreCampo: string): number => {
      const texto = valor(columna);
      if (!texto) return 0;
      const n = parsearDecimal(texto, escala);
      if (n === null) {
        problemas.push(`${nombreCampo} "${texto}" no válido`);
        return 0;
      }
      return n;
    };
    const costo = leerOpcional('costo_usd', ESCALA.diezmilesimas, 'costo');
    const stock = leerOpcional('stock', ESCALA.milesimas, 'stock');
    const stockMinimo = leerOpcional('stock_minimo', ESCALA.milesimas, 'stock mínimo');
    if (unidad === 'unidad' && (stock % 1000 !== 0 || stockMinimo % 1000 !== 0)) {
      problemas.push('un producto por unidad no admite cantidades con decimales');
    }

    const codigo = valor('codigo').toUpperCase();
    if (codigo) {
      if (existentes.codigos.has(codigo)) problemas.push(`el código ${codigo} ya existe`);
      else if (codigosArchivo.has(codigo)) problemas.push(`el código ${codigo} está repetido en el archivo`);
    }
    const barras = valor('codigo_barras').replace(/\s/g, '');
    if (barras) {
      if (existentes.barras.has(barras)) problemas.push(`el código de barras ${barras} ya existe`);
      else if (barrasArchivo.has(barras)) problemas.push(`el código de barras ${barras} está repetido en el archivo`);
    }

    if (problemas.length > 0) {
      errores.push({ fila: numero, mensaje: problemas.join('; ') });
      return;
    }
    if (codigo) codigosArchivo.add(codigo);
    if (barras) barrasArchivo.add(barras);
    validas.push({
      fila: numero,
      categoriaNombre: valor('categoria'),
      stock,
      datos: {
        codigo,
        codigoBarras: barras,
        nombre,
        categoriaId: null,
        unidad,
        monedaPrecio: moneda,
        precio: precio!,
        costoPromedio: costo,
        stockMinimo,
        activo: true,
      },
    });
  });

  return { validas, errores, columnasIgnoradas };
}
