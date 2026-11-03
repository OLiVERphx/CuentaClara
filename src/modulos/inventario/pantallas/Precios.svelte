<script lang="ts">
  import { tick } from 'svelte';
  import { puede, redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import TarjetaPrecio from './TarjetaPrecio.svelte';

  let consulta = $state('');
  let buscador: HTMLInputElement;

  const resultados = $derived.by(() => {
    void inventario.version;
    return inventario.indice.buscar(consulta, { limite: 30 });
  });
  const tasa = $derived(tasaDelDia());
  const redondeo = $derived(redondeoBs());

  $effect(() => {
    void tick().then(() => buscador?.focus());
  });

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      consulta = '';
    }
  }
</script>

<div class="pila">
  <div class="buscador">
    <Icono nombre="buscar" tamano={22} />
    <input
      bind:this={buscador}
      bind:value={consulta}
      onkeydown={alTeclear}
      data-busqueda
      type="search"
      placeholder="Buscar producto por nombre o código…"
      aria-label="Buscar producto"
      autocomplete="off"
      spellcheck="false"
    />
    <kbd class="atajo" title="Atajo de teclado">F2</kbd>
  </div>

  {#if !inventario.cargado}
    <p class="vacio">Cargando catálogo…</p>
  {:else if inventario.indice.tamano === 0}
    <div class="tarjeta vacio pila-chica">
      <p><strong>Todavía no hay productos.</strong></p>
      {#if puede('productos.editar')}
        <div class="fila" style:justify-content="center">
          <a class="btn btn-primario" href="#/productos/nuevo"><Icono nombre="mas" /> Crear producto</a>
          <a class="btn" href="#/inventario/importar"><Icono nombre="subir" /> Importar desde Excel (CSV)</a>
        </div>
      {/if}
    </div>
  {:else if consulta.trim() === ''}
    <p class="vacio">
      Escribe parte del nombre o el código. Por ejemplo, <em>har pan</em> encuentra «Harina P.A.N.».<br />
      <span class="ayuda">{inventario.indice.tamano} productos en el catálogo · Esc borra la búsqueda</span>
    </p>
  {:else if resultados.length === 0}
    <p class="vacio">No se encontró «{consulta}».</p>
  {:else}
    <div class="resultados">
      {#each resultados as r (r.producto.id)}
        <TarjetaPrecio resultado={r} {tasa} {redondeo} categoria={inventario.indice.nombreCategoria(r.producto.categoriaId)} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .buscador {
    position: sticky;
    top: 70px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 0.9rem;
    border: 2px solid var(--primario);
    border-radius: var(--radio);
    background: var(--superficie);
    box-shadow: var(--sombra);
    color: var(--primario);
  }

  .buscador input {
    border: 0;
    outline: none;
    min-height: 56px;
    font-size: 1.2rem;
    padding: 0;
    background: transparent;
  }

  .buscador input:focus {
    outline: none;
  }

  .atajo {
    font-family: var(--mono);
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--borde);
    border-radius: 4px;
    color: var(--texto-suave);
  }

  .resultados {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1rem;
  }

  @media (max-width: 760px) {
    .buscador {
      top: 66px;
    }

    .atajo {
      display: none;
    }

    .resultados {
      grid-template-columns: 1fr;
    }
  }
</style>
