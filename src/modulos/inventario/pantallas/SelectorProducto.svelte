<script lang="ts">
  import { formatearCantidad } from '../../../core/dinero/dinero';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import type { Producto } from '../tipos';

  let { seleccionado = $bindable(null) }: { seleccionado?: Producto | null } = $props();

  let texto = $state('');
  let abierto = $state(false);
  let activo = $state(0);

  const resultados = $derived.by(() => {
    void inventario.version;
    return inventario.indice.buscar(texto, { limite: 8, incluirInactivos: true });
  });

  function elegir(p: Producto) {
    seleccionado = p;
    texto = '';
    abierto = false;
  }

  function alTeclear(e: KeyboardEvent) {
    if (!abierto || resultados.length === 0) return;
    if (e.key === 'ArrowDown') activo = Math.min(activo + 1, resultados.length - 1);
    else if (e.key === 'ArrowUp') activo = Math.max(activo - 1, 0);
    else if (e.key === 'Enter') elegir(resultados[activo]!.producto);
    else if (e.key === 'Escape') abierto = false;
    else return;
    e.preventDefault();
  }
</script>

{#if seleccionado}
  <div class="elegido">
    <div class="pila-chica">
      <strong>{seleccionado.nombre}</strong>
      <span class="ayuda"><span class="mono">{seleccionado.codigo}</span> · Stock: <span class="num">{formatearCantidad(seleccionado.stock, seleccionado.unidad)}</span></span>
    </div>
    <button type="button" class="btn btn-chico" onclick={() => (seleccionado = null)}>Cambiar</button>
  </div>
{:else}
  <div class="selector">
    <div class="entrada">
      <Icono nombre="buscar" />
      <input
        bind:value={texto}
        oninput={() => {
          abierto = true;
          activo = 0;
        }}
        onkeydown={alTeclear}
        onblur={() => setTimeout(() => (abierto = false), 150)}
        placeholder="Buscar el producto…"
        aria-label="Buscar producto"
        role="combobox"
        aria-expanded={abierto && resultados.length > 0}
        aria-controls="lista-productos"
        autocomplete="off"
      />
    </div>
    {#if abierto && resultados.length > 0}
      <ul class="lista" id="lista-productos" role="listbox">
        {#each resultados as r, i (r.producto.id)}
          <li role="option" aria-selected={i === activo}>
            <button type="button" class:activo={i === activo} onmousedown={(e) => e.preventDefault()} onclick={() => elegir(r.producto)}>
              <span>{r.producto.nombre}</span>
              <span class="ayuda num">{formatearCantidad(r.producto.stock, r.producto.unidad)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .selector {
    position: relative;
  }

  .entrada {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 0.7rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    background: var(--superficie);
    color: var(--texto-suave);
  }

  .entrada:focus-within {
    outline: 2px solid var(--primario);
    outline-offset: -1px;
  }

  .entrada input {
    border: 0;
    outline: none;
    background: transparent;
  }

  .lista {
    position: absolute;
    z-index: 20;
    left: 0;
    right: 0;
    margin: 0.25rem 0 0;
    padding: 0.25rem;
    list-style: none;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
  }

  .lista button {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    min-height: 42px;
    padding: 0.4rem 0.6rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--texto);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .lista button:hover,
  .lista button.activo {
    background: var(--primario-suave);
  }

  .elegido {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--primario);
    border-radius: var(--radio-chico);
    background: var(--primario-suave);
  }
</style>
