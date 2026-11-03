<script lang="ts">
  import { app, tasaDelDia } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { navegar } from '../../../app/router.svelte';
  import { untrack } from 'svelte';
  import { bsAUsd, formatearBs, formatearUsd } from '../../../core/dinero/dinero';
  import { formatearMonto } from '../../../core/pagos';
  import { formatearFecha } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import { compras } from '../almacen.svelte';
  import { urgencia } from '../calculos';
  import { listarCompras } from '../servicio';
  import { NOMBRE_ESTADO_PAGO, type Compra } from '../tipos';

  let { consulta }: PropsPantalla = $props();
  const proveedorId = untrack(() => consulta.get('proveedor')) ?? '';

  let soloPendientes = $state(true);
  let lista = $state<Compra[]>([]);
  let pendientes = $state<Compra[]>([]);
  const tasa = $derived(tasaDelDia());

  $effect(() => {
    void compras.version;
    const filtro = { soloPendientes, proveedorId: proveedorId || undefined };
    void listarCompras(filtro).then((r) => (lista = r));
    void listarCompras({ soloPendientes: true }).then((r) => (pendientes = r));
  });

  const deudaUsd = $derived(pendientes.filter((c) => c.moneda === 'USD').reduce((s, c) => s + c.total - c.pagado, 0));
  const deudaBs = $derived(pendientes.filter((c) => c.moneda === 'VES').reduce((s, c) => s + c.total - c.pagado, 0));
  const vencidas = $derived(pendientes.filter((c) => urgencia(c.vencimiento, app.hoy) === 'vencida').length);
  const ETIQUETA_URGENCIA = { vencida: 'Vencida', pronto: 'Vence pronto', al_dia: '', sin_fecha: '' };
</script>

<div class="encabezado-pagina">
  <h1>Compras {proveedorId ? `· ${compras.nombreProveedor(proveedorId)}` : ''}</h1>
  <div class="fila">
    <a class="btn" href="#/proveedores"><Icono nombre="personas" /> Proveedores</a>
    <a class="btn btn-primario" href="#/compras/nueva"><Icono nombre="mas" /> Nueva compra</a>
  </div>
</div>

<div class="resumen">
  <div class="tarjeta dato">
    <span class="suave">Debes en dólares</span>
    <strong class="num deuda">{formatearUsd(deudaUsd)}</strong>
  </div>
  {#if deudaBs > 0}
    <div class="tarjeta dato">
      <span class="suave">Debes en Bs fijo</span>
      <strong class="num deuda">{formatearBs(deudaBs)}</strong>
      {#if tasa !== null}<span class="ayuda num">≈ {formatearUsd(bsAUsd(deudaBs, tasa))} hoy</span>{/if}
    </div>
  {/if}
  <div class="tarjeta dato" class:alerta-vencidas={vencidas > 0}>
    <span class="suave">Facturas vencidas</span>
    <strong class="num">{vencidas}</strong>
  </div>
</div>

<div class="fila filtros">
  <div class="segmentado" role="radiogroup" aria-label="Filtro">
    <label><input type="radio" bind:group={soloPendientes} value={true} /> Por pagar</label>
    <label><input type="radio" bind:group={soloPendientes} value={false} /> Todas</label>
  </div>
  {#if proveedorId}<a href="#/compras" class="btn btn-chico btn-fantasma">Ver todos los proveedores</a>{/if}
</div>

{#if lista.length === 0}
  <div class="tarjeta vacio">
    {soloPendientes ? 'No le debes nada a ningún proveedor.' : 'Todavía no hay compras registradas.'}
  </div>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th class="ocultable">Factura</th>
          <th class="derecha">Total</th>
          <th class="derecha">Por pagar</th>
          <th>Vence</th>
        </tr>
      </thead>
      <tbody>
        {#each lista as c (c.id)}
          {@const u = c.estadoPago === 'pagada' ? 'al_dia' : urgencia(c.vencimiento, app.hoy)}
          <tr class="clicable" onclick={() => navegar(`/compras/${c.id}`)}>
            <td class="num">{formatearFecha(c.fecha)}</td>
            <td><a href="#/compras/{c.id}" class="enlace-fila" onclick={(e) => e.stopPropagation()}>{compras.nombreProveedor(c.proveedorId)}</a></td>
            <td class="ocultable suave">{c.facturaProveedor || c.numero}</td>
            <td class="derecha num">{formatearMonto(c.total, c.moneda)}</td>
            <td class="derecha num">
              {#if c.estadoPago === 'pagada'}<span class="chip chip-normal">{NOMBRE_ESTADO_PAGO.pagada}</span>
              {:else}<strong>{formatearMonto(c.total - c.pagado, c.moneda)}</strong>{/if}
            </td>
            <td>
              {#if c.estadoPago !== 'pagada' && c.vencimiento}
                <span class="chip" class:chip-agotado={u === 'vencida'} class:chip-bajo={u === 'pronto'}>
                  {formatearFecha(c.vencimiento)}{ETIQUETA_URGENCIA[u] ? ` · ${ETIQUETA_URGENCIA[u]}` : ''}
                </span>
              {/if}
            </td>
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

  .alerta-vencidas strong {
    color: var(--peligro);
  }

  .filtros {
    margin-bottom: 0.75rem;
  }

  .enlace-fila {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
