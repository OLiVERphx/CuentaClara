import { normalizar } from '../../core/util/texto';
import type { Categoria, Presentacion, Producto } from './tipos';

export interface ResultadoBusqueda {
  producto: Producto;
  presentaciones: Presentacion[];
  /** Presentación encontrada por código de barras, si la búsqueda fue por código. */
  presentacionExacta: Presentacion | null;
}

interface Entrada {
  producto: Producto;
  presentaciones: Presentacion[];
  texto: string;
  palabras: string[];
  codigos: string[];
}

/**
 * Índice en memoria del catálogo (DISENO.md §8). Cada búsqueda recorre el
 * catálogo comparando texto ya normalizado, lo que con 20.000 productos toma
 * pocos milisegundos y evita ir a IndexedDB en cada tecla.
 */
export class IndiceProductos {
  private entradas = new Map<string, Entrada>();
  private porCodigo = new Map<string, { productoId: string; presentacionId: string | null }>();
  private categorias = new Map<string, string>();

  cargar(productos: Producto[], presentaciones: Presentacion[], categorias: Categoria[]): void {
    this.entradas.clear();
    this.porCodigo.clear();
    this.categorias = new Map(categorias.map((c) => [c.id, c.nombre]));
    const porProducto = new Map<string, Presentacion[]>();
    for (const p of presentaciones) {
      const lista = porProducto.get(p.productoId) ?? [];
      lista.push(p);
      porProducto.set(p.productoId, lista);
    }
    for (const producto of productos) this.poner(producto, porProducto.get(producto.id) ?? []);
  }

  actualizarCategorias(categorias: Categoria[]): void {
    this.categorias = new Map(categorias.map((c) => [c.id, c.nombre]));
    // Se recorre una copia: `poner` saca y vuelve a meter cada entrada, y un Map
    // visita de nuevo lo que se reinserta durante el recorrido (ciclo infinito).
    for (const e of [...this.entradas.values()]) this.poner(e.producto, e.presentaciones);
  }

  poner(producto: Producto, presentaciones: Presentacion[]): void {
    this.quitar(producto.id);
    if (producto.eliminadoEn !== null) return;
    const vigentes = presentaciones.filter((p) => p.eliminadoEn === null);
    const categoria = producto.categoriaId ? (this.categorias.get(producto.categoriaId) ?? '') : '';
    const texto = normalizar(`${producto.nombre} ${producto.codigo} ${categoria}`);
    const codigos: string[] = [];
    const indexar = (codigo: string, presentacionId: string | null) => {
      const clave = codigo.toLowerCase();
      codigos.push(clave);
      this.porCodigo.set(clave, { productoId: producto.id, presentacionId });
    };
    indexar(producto.codigo, null);
    if (producto.codigoBarras) indexar(producto.codigoBarras, null);
    for (const p of vigentes) if (p.codigoBarras) indexar(p.codigoBarras, p.id);
    this.entradas.set(producto.id, { producto, presentaciones: vigentes, texto, palabras: texto.split(' '), codigos });
  }

  quitar(productoId: string): void {
    const entrada = this.entradas.get(productoId);
    if (!entrada) return;
    for (const codigo of entrada.codigos) {
      if (this.porCodigo.get(codigo)?.productoId === productoId) this.porCodigo.delete(codigo);
    }
    this.entradas.delete(productoId);
  }

  obtener(productoId: string): ResultadoBusqueda | null {
    const e = this.entradas.get(productoId);
    return e ? { producto: e.producto, presentaciones: e.presentaciones, presentacionExacta: null } : null;
  }

  nombreCategoria(categoriaId: string | null): string {
    return categoriaId ? (this.categorias.get(categoriaId) ?? '') : '';
  }

  /** Códigos internos y de barras ocupados (para validar importaciones). */
  codigosEnUso(): { codigos: Set<string>; barras: Set<string> } {
    const codigos = new Set<string>();
    const barras = new Set<string>();
    for (const e of this.entradas.values()) {
      codigos.add(e.producto.codigo);
      if (e.producto.codigoBarras) barras.add(e.producto.codigoBarras);
      for (const p of e.presentaciones) if (p.codigoBarras) barras.add(p.codigoBarras);
    }
    return { codigos, barras };
  }

  todos(): Producto[] {
    return [...this.entradas.values()].map((e) => e.producto);
  }

  get tamano(): number {
    return this.entradas.size;
  }

  /**
   * Busca por código exacto (interno o de barras) y por palabras: cada palabra
   * escrita debe aparecer en el nombre, el código o la categoría. Así
   * "har pan" encuentra "Harina P.A.N. 1kg".
   */
  buscar(consulta: string, opciones: { limite?: number; incluirInactivos?: boolean } = {}): ResultadoBusqueda[] {
    const limite = opciones.limite ?? 30;
    const crudo = consulta.trim().toLowerCase();
    const q = normalizar(consulta);
    if (!q) return [];

    const exacto = this.porCodigo.get(crudo);
    const resultados: { r: ResultadoBusqueda; puntaje: number }[] = [];
    if (exacto) {
      const e = this.entradas.get(exacto.productoId);
      if (e && (opciones.incluirInactivos || e.producto.activo)) {
        const presentacionExacta = e.presentaciones.find((p) => p.id === exacto.presentacionId) ?? null;
        resultados.push({ r: { producto: e.producto, presentaciones: e.presentaciones, presentacionExacta }, puntaje: Infinity });
      }
    }

    const tokens = q.split(' ');
    for (const e of this.entradas.values()) {
      if (exacto && e.producto.id === exacto.productoId) continue;
      if (!opciones.incluirInactivos && !e.producto.activo) continue;
      let puntaje = 0;
      let coincide = true;
      for (const token of tokens) {
        if (!e.texto.includes(token)) {
          coincide = false;
          break;
        }
        puntaje += e.palabras.some((p) => p.startsWith(token)) ? 10 : 1;
      }
      if (!coincide) continue;
      if (e.producto.nombreNormalizado.startsWith(q)) puntaje += 100;
      resultados.push({ r: { producto: e.producto, presentaciones: e.presentaciones, presentacionExacta: null }, puntaje });
    }

    resultados.sort(
      (a, b) =>
        b.puntaje - a.puntaje ||
        a.r.producto.nombre.length - b.r.producto.nombre.length ||
        a.r.producto.nombre.localeCompare(b.r.producto.nombre),
    );
    return resultados.slice(0, limite).map((x) => x.r);
  }
}
