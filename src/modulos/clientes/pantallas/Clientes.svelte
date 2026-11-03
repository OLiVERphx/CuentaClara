<script lang="ts">
  import { puede, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import { formatearBs, formatearUsd, usdABs } from '../../../core/dinero/dinero';
  import { normalizar } from '../../../core/util/texto';
  import Icono from '../../../ui/Icono.svelte';
  import { clientes } from '../almacen.svelte';
  import EtiquetaSaldo from './EtiquetaSaldo.svelte';

  let texto = $state('');
  let filtro = $state<'deuda' | 'favor' | 'todos'>('todos');
  const tasa = $derived(tasaDelDia());

  const lista = $derived.by(() => {
    const q = normalizar(texto);
    const filtrada = clientes.lista.filter((c) => {
      if (q && !q.split(' ').every((t) => c.nombreNormalizado.includes(t)) && !c.cedula.includes(texto.trim().toUpperCase())) return false;
      if (filtro === 'deuda') return c.saldoUsd > 0;
      if (filtro === 'favor') return c.saldoUsd < 0;
      return true;
    });
    // Los que más deben, primero.
    return filtrada.sort((a, b) => b.saldoUsd - a.saldoUsd || a.nombre.localeCompare(b.nombre));
  });

  const deudores = $derived(clientes.lista.filter((c) => c.saldoUsd > 0));
  const totalDeuda = $derived(deudores.reduce((s, c) => s + c.saldoUsd, 0));
  const totalFavor = $derived(clientes.lista.reduce((s, c) => s + (c.saldoUsd < 0 ? -c.saldoUsd : 0), 0));
</script>

<div class="encabezado-pagina">
  <h1>Clientes</h1>
  {#if puede('clientes.gestionar')}
    <a class="btn btn-primario" href="#/clientes/nuevo"><Icono nombre="mas" /> Nuevo cliente</a>
  {/if}
</div>

<div class="resumen">
  <div class="tarjeta dato">
    <span class="suave">Te deben (fiao)</span>
    <strong class="num deuda">{formatearUsd(totalDeuda)}</strong>
    {#if tasa !== null}<span class="ayuda num">≈ {formatearBs(usdABs(totalDeuda, tasa))} a la tasa de hoy</span>{/if}
  </div>
  <div class="tarjeta dato">
    <span class="suave">Clientes que deben</span>
    <strong class="num">{deudores.length}</strong>
  </div>
  {#if totalFavor > 0}
    <div class="tarjeta dato">
      <span class="suave">Saldos a favor</span>
      <strong class="num">{formatearUsd(totalFavor)}</strong>
    </div>
  {/if}
</div>

<div class="filtros">
  <input type="search" bind:value={texto} placeholder="Buscar por nombre o cédula…" aria-label="Buscar cliente" />
  <select bind:value={filtro} aria-label="Filtro">
    <option value="todos">Todos</option>
    <option value="deuda">Con deuda</option>
    <option value="favor">Con saldo a favor</option>
  </select>
</div>

{#if clientes.lista.length === 0}
  <div class="tarjeta vacio pila-chica">
    <p><strong>Todavía no hay clientes.</strong></p>
    <p>Crea a los clientes de confianza para llevarles el fiao. Si ya tienen deudas en el cuaderno, cárgalas con un ajuste en su ficha.</p>
  </div>
{:else if lista.length === 0}
  <p class="vacio">Ningún cliente coincide.</p>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th class="ocultable">Cédula</th>
          <th class="ocultable">Teléfono</th>
          <th class="derecha">Saldo</th>
          <th class="derecha ocultable">En Bs hoy</th>
          <th class="derecha ocultable">Límite</th>
        </tr>
      </thead>
      <tbody>
        {#each lista as c (c.id)}
          <tr class="clicable" class:inactivo={!c.activo} onclick={() => navegar(`/clientes/${c.id}`)}>
            <td><a href="#/clientes/{c.id}" class="enlace-fila" onclick={(e) => e.stopPropagation()}>{c.nombre}</a></td>
            <td class="ocultable mono">{c.cedula}</td>
            <td class="ocultable">{c.telefono}</td>
            <td class="derecha"><EtiquetaSaldo saldoUsd={c.saldoUsd} /></td>
            <td class="derecha num ocultable">{c.saldoUsd > 0 && tasa !== null ? formatearBs(usdABs(c.saldoUsd, tasa)) : ''}</td>
            <td class="derecha num ocultable suave">{c.limiteCreditoUsd === null ? 'Sin límite' : formatearUsd(c.limiteCreditoUsd)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .resumen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .dato {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .dato strong {
    font-size: 1.5rem;
  }

  .deuda {
    color: var(--peligro);
  }

  .filtros {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .enlace-fila {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }

  .inactivo td {
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
