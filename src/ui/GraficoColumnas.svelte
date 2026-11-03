<script lang="ts" module>
  /**
   * Columnas de una sola serie (por ejemplo, ventas por día). Sigue las reglas
   * del sistema de gráficos: columnas finas con punta redondeada, rejilla
   * tenue, sin leyenda (una sola serie: el título la nombra), detalle al pasar
   * el mouse o enfocar con el teclado, y vista de tabla para leer todo sin hover.
   */
  export interface Punto {
    etiqueta: string;
    /** Etiqueta corta para el eje (por ejemplo, el día). */
    corta: string;
    valor: number;
    detalle?: string;
  }
</script>

<script lang="ts">
  let {
    puntos,
    formatear,
    formatearEje,
    titulo,
  }: { puntos: Punto[]; formatear: (v: number) => string; formatearEje: (v: number) => string; titulo: string } = $props();

  let activo = $state<number | null>(null);
  let verTabla = $state(false);

  /** Máximo "redondo" del eje y tres marcas: 0, mitad y tope. */
  const escala = $derived.by(() => {
    const max = Math.max(...puntos.map((p) => p.valor), 0);
    if (max <= 0) return { tope: 1, marcas: [0] };
    const potencia = 10 ** Math.floor(Math.log10(max));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p * 2 >= max) ?? potencia * 10;
    return { tope: paso * 2, marcas: [0, paso, paso * 2] };
  });

  // Con muchos días, no se rotula cada columna.
  const cadaCuanto = $derived(Math.ceil(puntos.length / 8));
</script>

<section class="grafico" aria-label={titulo}>
  <div class="cabecera">
    <h2 class="titulo">{titulo}</h2>
    <button class="btn btn-fantasma btn-chico" onclick={() => (verTabla = !verTabla)}>{verTabla ? 'Ver gráfico' : 'Ver tabla'}</button>
  </div>

  {#if verTabla}
    <div class="tabla-contenedor">
      <table>
        <tbody>
          {#each puntos as p}
            <tr><td>{p.etiqueta}</td><td class="derecha num">{formatear(p.valor)}</td><td class="suave">{p.detalle ?? ''}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="area">
      <div class="eje-y" aria-hidden="true">
        {#each [...escala.marcas].reverse() as m}<span class="num">{formatearEje(m)}</span>{/each}
      </div>
      <div class="lienzo">
        {#each escala.marcas as m}
          <div class="rejilla" class:base={m === 0} style:bottom="{(m / escala.tope) * 100}%"></div>
        {/each}
        <div class="columnas">
          {#each puntos as p, i}
            <button
              type="button"
              class="celda"
              aria-label="{p.etiqueta}: {formatear(p.valor)}"
              onpointerenter={() => (activo = i)}
              onpointerleave={() => (activo = null)}
              onfocus={() => (activo = i)}
              onblur={() => (activo = null)}
            >
              <div class="columna" class:activa={activo === i} style:height="{(p.valor / escala.tope) * 100}%"></div>
              {#if activo === i}
                <div class="tooltip" class:izquierda={i > puntos.length / 2}>
                  <strong class="num">{formatear(p.valor)}</strong>
                  <span>{p.etiqueta}</span>
                  {#if p.detalle}<span class="suave">{p.detalle}</span>{/if}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
    <div class="eje-x" aria-hidden="true">
      {#each puntos as p, i}
        <span>{i % cadaCuanto === 0 || i === puntos.length - 1 ? p.corta : ''}</span>
      {/each}
    </div>
  {/if}
</section>

<style>
  .grafico {
    margin: 0;
  }

  .cabecera {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .titulo {
    font-size: 1rem;
  }

  .area {
    display: flex;
    gap: 0.5rem;
    height: 180px;
  }

  .eje-y {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 0.75rem;
    color: var(--texto-suave);
    text-align: right;
    min-width: 3.2rem;
    transform: translateY(0.45em);
  }

  .lienzo {
    position: relative;
    flex: 1;
  }

  .rejilla {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--grafico-rejilla);
  }

  .rejilla.base {
    border-top-color: var(--grafico-eje);
  }

  .columnas {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 2px;
  }

  .celda {
    position: relative;
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: default;
    outline: none;
  }

  .celda:focus-visible {
    box-shadow: inset 0 0 0 2px var(--foco);
    border-radius: 4px;
  }

  .columna {
    width: 100%;
    max-width: 24px;
    min-height: 0;
    background: var(--grafico-serie);
    border-radius: 4px 4px 0 0;
    transition: filter 0.1s;
  }

  .columna.activa {
    filter: brightness(1.15);
  }

  .tooltip {
    position: absolute;
    bottom: calc(100% - 2rem);
    left: 50%;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    background: var(--superficie);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.15);
    font-size: 0.82rem;
    white-space: nowrap;
    pointer-events: none;
  }

  .tooltip.izquierda {
    left: auto;
    right: 50%;
  }

  .eje-x {
    display: flex;
    gap: 2px;
    margin-left: 3.7rem;
    font-size: 0.72rem;
    color: var(--texto-suave);
  }

  .eje-x span {
    flex: 1;
    text-align: center;
    white-space: nowrap;
    overflow: visible;
  }
</style>
