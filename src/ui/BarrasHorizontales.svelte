<script lang="ts" module>
  /**
   * Lista de barras horizontales de una sola serie, ordenada (por ejemplo,
   * cobros por método o productos más vendidos). Cada barra lleva su valor en
   * la punta, así que se lee sin pasar el mouse.
   */
  export interface Barra {
    etiqueta: string;
    valor: number;
    texto: string;
    detalle?: string;
    enlace?: string;
  }
</script>

<script lang="ts">
  let { barras }: { barras: Barra[] } = $props();

  const max = $derived(Math.max(...barras.map((b) => b.valor), 1));
</script>

<ul class="barras">
  {#each barras as b}
    <li title={b.detalle ? `${b.etiqueta}: ${b.texto} · ${b.detalle}` : `${b.etiqueta}: ${b.texto}`}>
      <span class="etiqueta">{#if b.enlace}<a href={b.enlace}>{b.etiqueta}</a>{:else}{b.etiqueta}{/if}</span>
      <div class="pista">
        <div class="barra" style:width="{Math.max((b.valor / max) * 100, 0.5)}%"></div>
        <span class="valor num">{b.texto}{#if b.detalle}<span class="suave"> · {b.detalle}</span>{/if}</span>
      </div>
    </li>
  {/each}
</ul>

<style>
  .barras {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(90px, 0.6fr) 1.4fr;
    gap: 0.75rem;
    align-items: center;
    padding: 0.15rem 0.25rem;
    border-radius: var(--radio-chico);
  }

  li:hover {
    background: var(--superficie-2);
  }

  .etiqueta {
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .etiqueta a {
    color: var(--texto);
    text-decoration: none;
  }

  .pista {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .barra {
    height: 14px;
    background: var(--grafico-serie);
    border-radius: 0 4px 4px 0;
    flex-shrink: 0;
    max-width: 65%;
  }

  .valor {
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    li {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
