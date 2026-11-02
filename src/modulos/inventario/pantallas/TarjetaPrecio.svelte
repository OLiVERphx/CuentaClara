<script lang="ts">
  import { ESCALA, formatearBs, formatearCantidad, formatearUsd, multiplicarCantidad, parsearDecimal, type Tasa4 } from '../../../core/dinero/dinero';
  import type { ResultadoBusqueda } from '../busqueda';
  import { enBs, enUsd, estadoStock, precioPresentacion } from '../precios';

  let { resultado, tasa, categoria }: { resultado: ResultadoBusqueda; tasa: Tasa4 | null; categoria: string } = $props();

  const p = $derived(resultado.producto);
  const estado = $derived(estadoStock(p));
  const presentaciones = $derived(resultado.presentaciones.filter((x) => x.paraVenta));

  let pesoTexto = $state('');
  const peso = $derived(pesoTexto ? parsearDecimal(pesoTexto, ESCALA.milesimas) : null);

  const ETIQUETA_STOCK = { agotado: 'Agotado', bajo: 'Stock bajo', normal: 'Disponible' };
</script>

<article class="tarjeta resultado" class:destacado={resultado.presentacionExacta !== null}>
  <div class="cabeza">
    <div class="pila-chica titulo">
      <a href="#/productos/{p.id}" class="nombre">{p.nombre}</a>
      <span class="ayuda"><span class="mono">{p.codigo}</span>{categoria ? ` · ${categoria}` : ''}</span>
    </div>
    <span class="chip chip-{estado}" title="Stock en el sistema">
      {ETIQUETA_STOCK[estado]} · <span class="num">{formatearCantidad(p.stock, p.unidad)}</span>
    </span>
  </div>

  {#if tasa === null && p.monedaPrecio === 'USD'}
    <div class="precio">
      <strong class="num principal">{formatearUsd(p.precio)}</strong>
      <span class="ayuda">Sin tasa: no se puede mostrar en Bs</span>
    </div>
  {:else}
    <div class="precio">
      <strong class="num principal">{formatearBs(enBs(p.precio, p.monedaPrecio, tasa ?? 0))}</strong>
      {#if tasa !== null}
        <span class="num secundario">{p.monedaPrecio === 'VES' ? '≈ ' : ''}{formatearUsd(enUsd(p.precio, p.monedaPrecio, tasa))}</span>
      {/if}
      <span class="ayuda">{p.unidad === 'kg' ? 'por kg' : 'por unidad'}{p.monedaPrecio === 'VES' ? ' · precio fijo en Bs' : ''}</span>
    </div>
  {/if}

  {#if presentaciones.length > 0}
    <ul class="presentaciones">
      {#each presentaciones as pres (pres.id)}
        {@const monto = precioPresentacion(p, pres)}
        <li class:exacta={resultado.presentacionExacta?.id === pres.id}>
          <span>{pres.nombre} <span class="ayuda">({formatearCantidad(pres.factor, p.unidad)})</span></span>
          <span class="num">
            {#if tasa !== null}<strong>{formatearBs(enBs(monto, p.monedaPrecio, tasa))}</strong> · {/if}{formatearUsd(tasa !== null ? enUsd(monto, p.monedaPrecio, tasa) : monto)}
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if p.unidad === 'kg' && tasa !== null}
    <div class="calculadora">
      <label class="campo">
        <span>Calcular por peso (kg)</span>
        <input bind:value={pesoTexto} inputmode="decimal" placeholder="0,350" class="num" />
      </label>
      {#if peso}
        {@const monto = multiplicarCantidad(p.precio, peso)}
        <div class="num resultado-peso">
          {formatearCantidad(peso, 'kg')} = <strong>{formatearBs(enBs(monto, p.monedaPrecio, tasa))}</strong> · {formatearUsd(enUsd(monto, p.monedaPrecio, tasa))}
        </div>
      {/if}
    </div>
  {/if}
</article>

<style>
  .resultado {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .destacado {
    border-color: var(--primario);
  }

  .cabeza {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .titulo {
    gap: 0.1rem;
    min-width: 0;
  }

  .nombre {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--texto);
    text-decoration: none;
  }

  .nombre:hover {
    text-decoration: underline;
  }

  .precio {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .principal {
    font-size: 1.6rem;
    color: var(--primario);
  }

  .secundario {
    font-size: 1.15rem;
    font-weight: 600;
  }

  .presentaciones {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--borde);
  }

  .presentaciones li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.45rem 0;
    border-bottom: 1px dashed var(--borde);
  }

  .presentaciones li:last-child {
    border-bottom: 0;
  }

  .exacta {
    color: var(--primario);
    font-weight: 600;
  }

  .calculadora {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
    border-top: 1px solid var(--borde);
  }

  .calculadora .campo {
    width: 180px;
  }

  .resultado-peso {
    padding-bottom: 0.6rem;
  }
</style>
