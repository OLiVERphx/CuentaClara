<script lang="ts">
  import { navegar } from '../../../app/router.svelte';
  import { formatearBs, formatearUsd } from '../../../core/dinero/dinero';
  import { METODOS_PAGO } from '../../../core/pagos';
  import { hoyLocal } from '../../../core/util/fechas';
  import { caja } from '../../caja/almacen.svelte';
  import { clientes } from '../../clientes/almacen.svelte';
  import { ventasDelDia } from '../servicio';
  import type { Pago, Venta } from '../tipos';

  let fecha = $state(hoyLocal());
  let filas = $state<{ venta: Venta; pagos: Pago[] }[]>([]);
  let cargando = $state(true);

  $effect(() => {
    const dia = fecha;
    void caja.version; // recarga tras vender, anular o devolver
    cargando = true;
    void ventasDelDia(dia).then((r) => {
      if (dia === fecha) {
        filas = r;
        cargando = false;
      }
    });
  });

  const completadas = $derived(filas.filter((f) => f.venta.estado === 'completada'));
  const totalBs = $derived(completadas.reduce((s, f) => s + f.venta.totalBs, 0));
  const totalUsd = $derived(completadas.reduce((s, f) => s + f.venta.totalUsd, 0));

  function hora(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function metodos(pagos: Pago[]): string {
    return [...new Set(pagos.filter((p) => !p.esVuelto).map((p) => METODOS_PAGO[p.metodo].nombre))].join(', ');
  }
</script>

<div class="encabezado-pagina">
  <h1>Ventas</h1>
  <label class="campo fecha">
    <span class="oculto-visual">Día</span>
    <input type="date" bind:value={fecha} max={hoyLocal()} />
  </label>
</div>

<div class="resumen">
  <div class="tarjeta dato">
    <span class="suave">Ventas</span>
    <strong class="num">{completadas.length}</strong>
  </div>
  <div class="tarjeta dato">
    <span class="suave">Total vendido</span>
    <strong class="num">{formatearBs(totalBs)}</strong>
    <span class="ayuda num">{formatearUsd(totalUsd)}</span>
  </div>
  {#if filas.length > completadas.length}
    <div class="tarjeta dato">
      <span class="suave">Anuladas</span>
      <strong class="num">{filas.length - completadas.length}</strong>
    </div>
  {/if}
</div>

{#if cargando}
  <p class="vacio">Cargando…</p>
{:else if filas.length === 0}
  <p class="vacio">No hay ventas este día.</p>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th>Hora</th>
          <th>Número</th>
          <th class="ocultable">Pago</th>
          <th class="derecha">Total Bs</th>
          <th class="derecha ocultable">Total $</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each filas as { venta, pagos } (venta.id)}
          <tr class="clicable" class:anulada={venta.estado === 'anulada'} onclick={() => navegar(`/ventas/${venta.id}`)}>
            <td class="num">{hora(venta.creadoEn)}</td>
            <td>
              <a href="#/ventas/{venta.id}" class="mono" onclick={(e) => e.stopPropagation()}>{venta.numero}</a>
              {#if venta.clienteId}<span class="ayuda"> · {clientes.obtener(venta.clienteId)?.nombre}</span>{/if}
            </td>
            <td class="ocultable suave">{metodos(pagos)}</td>
            <td class="derecha num">{formatearBs(venta.totalBs)}</td>
            <td class="derecha num ocultable">{formatearUsd(venta.totalUsd)}</td>
            <td>{#if venta.estado === 'anulada'}<span class="chip chip-agotado">Anulada</span>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .fecha {
    width: 180px;
  }

  .resumen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

  tr.anulada td {
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
