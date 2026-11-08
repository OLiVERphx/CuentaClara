<script lang="ts">
  import { ESCALA, formatearCantidad, parsearDecimal } from '../../../core/dinero/dinero';
  import { ErrorNegocio } from '../../../core/errores';
  import { normalizar } from '../../../core/util/texto';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { inventario } from '../almacen.svelte';
  import { registrarConteoMasivo } from '../servicio';
  import type { Producto } from '../tipos';

  // Lo escrito se guarda en este navegador mientras cuentas: si cierras la
  // pestaña o se va la luz, al volver sigue ahí.
  const CLAVE_BORRADOR = 'bodega.conteoRapido';

  function leerBorrador(): Record<string, string> {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      return crudo ? (JSON.parse(crudo) as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  let contados = $state<Record<string, string>>(leerBorrador());
  let busqueda = $state('');
  let categoria = $state('');
  let soloEscritos = $state(false);
  let motivo = $state('Puesta al día');
  let confirmando = $state(false);
  let guardando = $state(false);

  $effect(() => {
    const texto = JSON.stringify(contados);
    try {
      if (texto === '{}') localStorage.removeItem(CLAVE_BORRADOR);
      else localStorage.setItem(CLAVE_BORRADOR, texto);
    } catch {
      // Sin almacenamiento: el conteo funciona igual, solo no sobrevive a recargar.
    }
  });

  const productos = $derived.by(() => {
    void inventario.version;
    // Agrupados por categoría (los que no tienen van al final), como en el anaquel.
    const cat = (p: Producto) => inventario.indice.nombreCategoria(p.categoriaId);
    return inventario.indice
      .todos()
      .filter((p) => p.activo)
      .sort((a, b) => Number(!cat(a)) - Number(!cat(b)) || cat(a).localeCompare(cat(b)) || a.nombre.localeCompare(b.nombre));
  });

  interface Fila {
    producto: Producto;
    texto: string;
    contado: number | null;
    invalido: boolean;
    diferencia: number | null;
  }

  function evaluar(p: Producto): Fila {
    const texto = contados[p.id] ?? '';
    if (!texto.trim()) return { producto: p, texto, contado: null, invalido: false, diferencia: null };
    const n = parsearDecimal(texto, ESCALA.milesimas);
    const invalido = n === null || n < 0 || (p.unidad === 'unidad' && n % 1000 !== 0);
    return { producto: p, texto, contado: invalido ? null : n, invalido, diferencia: invalido || n === null ? null : n - p.stock };
  }

  const filas = $derived(productos.map(evaluar));

  const visibles = $derived.by(() => {
    const q = normalizar(busqueda);
    const tokens = q ? q.split(' ') : [];
    return filas.filter((f) => {
      if (categoria && (f.producto.categoriaId ?? 'sin') !== categoria) return false;
      if (soloEscritos && !f.texto.trim()) return false;
      if (tokens.length === 0) return true;
      const t = normalizar(`${f.producto.nombre} ${f.producto.codigo}`);
      return tokens.every((x) => t.includes(x));
    });
  });

  const escritos = $derived(filas.filter((f) => f.texto.trim()));
  const invalidos = $derived(escritos.filter((f) => f.invalido));
  const conDiferencia = $derived(escritos.filter((f) => f.diferencia !== null && f.diferencia !== 0));
  const faltan = $derived(conDiferencia.filter((f) => f.diferencia! < 0));
  const sobran = $derived(conDiferencia.filter((f) => f.diferencia! > 0));

  function signo(n: number, unidad: Producto['unidad']): string {
    return (n > 0 ? '+' : '') + formatearCantidad(n, unidad);
  }

  /** Enter pasa al siguiente campo, como en una hoja de cálculo. */
  function siguiente(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const campos = [...document.querySelectorAll<HTMLInputElement>('input[data-conteo]')];
    const i = campos.indexOf(e.currentTarget as HTMLInputElement);
    campos[i + 1]?.focus();
    campos[i + 1]?.select();
  }

  function igualQueSistema(p: Producto) {
    contados[p.id] = formatearCantidad(p.stock);
  }

  function revisar() {
    if (invalidos.length > 0) {
      avisarError(new ErrorNegocio(`Revisa ${invalidos.length === 1 ? 'la cantidad marcada en rojo' : `las ${invalidos.length} cantidades marcadas en rojo`}.`));
      soloEscritos = true;
      return;
    }
    if (conDiferencia.length === 0) {
      avisar('Todo lo que contaste coincide con el sistema. No hay nada que ajustar.');
      return;
    }
    confirmando = true;
  }

  async function guardar() {
    guardando = true;
    try {
      const n = await registrarConteoMasivo(
        conDiferencia.map((f) => ({ productoId: f.producto.id, contado: f.contado! })),
        motivo,
      );
      contados = {};
      soloEscritos = false;
      confirmando = false;
      avisar(`Listo: se ajustaron ${n} producto${n === 1 ? '' : 's'}. El inventario quedó al día.`);
    } catch (e) {
      avisarError(e);
    } finally {
      guardando = false;
    }
  }

  function descartar() {
    if (confirm('¿Borrar todo lo que has escrito en este conteo?')) contados = {};
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma" href="#/inventario" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Conteo rápido</h1>
  </div>
  {#if escritos.length > 0}
    <button class="btn btn-fantasma" onclick={descartar}><Icono nombre="basura" /> Empezar de nuevo</button>
  {/if}
</div>

<div class="alerta alerta-info pila-chica guia">
  <strong>Para ponerte al día</strong>
  <ol>
    <li>Si llegó mercancía, regístrala primero en <a href="#/compras/nueva">Compras</a>: así quedan su costo y lo que debes al proveedor.</li>
    <li>Después cuenta lo que hay en el anaquel y escríbelo aquí. Puedes ir por partes: lo escrito se guarda solo.</li>
    <li>Lo que dejes en blanco no se toca. Al final pulsa <strong>Revisar y guardar</strong>.</li>
  </ol>
</div>

<div class="filtros">
  <input type="search" bind:value={busqueda} placeholder="Buscar producto…" aria-label="Buscar producto" />
  <select bind:value={categoria} aria-label="Categoría">
    <option value="">Todas las categorías</option>
    {#each inventario.categorias as c (c.id)}
      <option value={c.id}>{c.nombre}</option>
    {/each}
    <option value="sin">Sin categoría</option>
  </select>
  <label class="casilla"><input type="checkbox" bind:checked={soloEscritos} /> Solo los que ya conté</label>
</div>

{#if visibles.length === 0}
  <p class="vacio">{productos.length === 0 ? 'Todavía no hay productos.' : 'Ningún producto coincide con el filtro.'}</p>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th class="derecha">Sistema</th>
          <th class="derecha">Contado</th>
          <th class="derecha">Diferencia</th>
        </tr>
      </thead>
      <tbody>
        {#each visibles as f (f.producto.id)}
          <tr class:escrito={f.texto.trim() !== ''}>
            <td>
              <span class="nombre">{f.producto.nombre}</span>
              <span class="suave detalle">{inventario.indice.nombreCategoria(f.producto.categoriaId) || 'Sin categoría'} · {f.producto.codigo}</span>
            </td>
            <td class="derecha num">
              <button type="button" class="btn btn-fantasma btn-chico num" title="Contaste lo mismo que dice el sistema" onclick={() => igualQueSistema(f.producto)}>
                {formatearCantidad(f.producto.stock, f.producto.unidad)}
              </button>
            </td>
            <td class="derecha">
              <input
                data-conteo
                class="num contado"
                inputmode="decimal"
                autocomplete="off"
                placeholder="—"
                aria-label="Cantidad contada de {f.producto.nombre}"
                aria-invalid={f.invalido}
                value={f.texto}
                oninput={(e) => (contados[f.producto.id] = e.currentTarget.value)}
                onkeydown={siguiente}
              />
            </td>
            <td class="derecha num">
              {#if f.invalido}
                <span class="negativo">{f.producto.unidad === 'unidad' ? 'Sin fracciones' : 'No válida'}</span>
              {:else if f.diferencia === 0}
                <span class="suave"><Icono nombre="check" tamano={16} /> Cuadra</span>
              {:else if f.diferencia !== null}
                <span class:negativo={f.diferencia < 0} class:positivo={f.diferencia > 0}>{signo(f.diferencia, f.producto.unidad)}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<div class="barra">
  <span class="resumen">
    <strong class="num">{escritos.length}</strong> contado{escritos.length === 1 ? '' : 's'} de {productos.length}
    {#if conDiferencia.length > 0}· <strong class="num">{conDiferencia.length}</strong> con diferencia{/if}
    {#if invalidos.length > 0}· <span class="negativo">{invalidos.length} por revisar</span>{/if}
  </span>
  <button class="btn btn-primario" onclick={revisar} disabled={escritos.length === 0}>
    <Icono nombre="check" /> Revisar y guardar
  </button>
</div>

<Modal bind:abierto={confirmando} titulo="Guardar conteo">
  <p>
    Se ajustará el stock de <strong>{conDiferencia.length}</strong> producto{conDiferencia.length === 1 ? '' : 's'}:
    {faltan.length} con menos de lo que decía el sistema y {sobran.length} con más.
  </p>
  <div class="tabla-contenedor lista-confirmar">
    <table>
      <tbody>
        {#each conDiferencia as f (f.producto.id)}
          <tr>
            <td>{f.producto.nombre}</td>
            <td class="derecha num suave">{formatearCantidad(f.producto.stock)} → {formatearCantidad(f.contado!)}</td>
            <td class="derecha num" class:negativo={f.diferencia! < 0} class:positivo={f.diferencia! > 0}>{signo(f.diferencia!, f.producto.unidad)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <label class="campo">
    <span>Nota (queda en el historial de cada producto)</span>
    <input bind:value={motivo} maxlength="80" />
  </label>
  <p class="ayuda">Los que cuadran no se tocan. Cada ajuste queda en los movimientos del producto.</p>
  {#snippet acciones()}
    <button class="btn" onclick={() => (confirmando = false)} disabled={guardando}>Seguir contando</button>
    <button class="btn btn-primario" onclick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button>
  {/snippet}
</Modal>

<style>
  .guia ol {
    margin: 0;
    padding-left: 1.2rem;
    color: var(--texto);
  }

  .guia li + li {
    margin-top: 0.25rem;
  }

  .filtros {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 1rem 0 0.75rem;
  }

  .filtros input[type='search'] {
    flex: 2 1 14rem;
  }

  .filtros select {
    flex: 1 1 10rem;
  }

  .nombre {
    display: block;
    font-weight: 500;
  }

  .detalle {
    font-size: 0.85rem;
  }

  .contado {
    width: 6.5rem;
    text-align: right;
  }

  tr.escrito {
    background: var(--primario-suave);
  }

  .positivo {
    color: var(--exito);
  }

  .negativo {
    color: var(--peligro);
  }

  .barra {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 0;
    background: linear-gradient(transparent, var(--fondo) 30%);
  }

  .lista-confirmar {
    max-height: 40vh;
    overflow: auto;
  }

  @media (max-width: 760px) {
    .barra {
      bottom: calc(72px + env(safe-area-inset-bottom));
    }
  }
</style>
