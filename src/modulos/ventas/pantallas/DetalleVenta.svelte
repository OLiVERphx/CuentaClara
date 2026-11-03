<script lang="ts">
  import { untrack } from 'svelte';
  import { app, puede } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { ESCALA, formatearCantidad, parsearDecimal, redondearAPaso } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO, type MetodoPago } from '../../../core/pagos';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { parteDeLinea } from '../calculos';
  import { anularVenta, obtenerVenta, registrarDevolucion, type VentaCompleta } from '../servicio';
  import Comprobante from './Comprobante.svelte';

  let { params }: PropsPantalla = $props();
  const id = untrack(() => params.id)!;

  let completa = $state<VentaCompleta | null>(null);
  let cargado = $state(false);

  async function cargar() {
    completa = await obtenerVenta(id);
    cargado = true;
  }
  void cargar();

  const devueltoPorItem = $derived.by(() => {
    const m = new Map<string, number>();
    for (const d of completa?.devolucionItems ?? []) m.set(d.ventaItemId, (m.get(d.ventaItemId) ?? 0) + d.cantidad);
    return m;
  });
  const esCompletada = $derived(completa?.venta.estado === 'completada');
  const quedaPorDevolver = $derived((completa?.items ?? []).some((i) => i.cantidad > (devueltoPorItem.get(i.id) ?? 0)));

  // ── Anular ──
  let anularAbierto = $state(false);
  let motivoAnular = $state('');
  let procesando = $state(false);

  async function anular() {
    procesando = true;
    try {
      await anularVenta(id, motivoAnular);
      avisar('Venta anulada. El stock y la caja quedaron corregidos.');
      anularAbierto = false;
      await cargar();
    } catch (e) {
      avisarError(e);
    } finally {
      procesando = false;
    }
  }

  // ── Devolver ──
  let devolverAbierto = $state(false);
  let cantidades = $state<Record<string, string>>({});
  let metodoDevolucion = $state<MetodoPago>('efectivo_bs');
  let motivoDevolucion = $state('');
  const METODOS_DEVOLUCION: MetodoPago[] = ['efectivo_bs', 'pago_movil', 'efectivo_usd'];

  const vistaDevolucion = $derived.by(() => {
    let montoBs = 0;
    let montoUsd = 0;
    let valido = true;
    let alguno = false;
    for (const item of completa?.items ?? []) {
      const texto = cantidades[item.id] ?? '';
      if (!texto.trim()) continue;
      const cantidad = parsearDecimal(texto, ESCALA.milesimas);
      const restante = item.cantidad - (devueltoPorItem.get(item.id) ?? 0);
      if (cantidad === null || cantidad <= 0 || cantidad > restante) {
        valido = false;
        continue;
      }
      alguno = true;
      const parte = parteDeLinea(item, cantidad);
      montoBs += parte.montoBs;
      montoUsd += parte.montoUsd;
    }
    const moneda = METODOS_PAGO[metodoDevolucion].moneda;
    let monto = moneda === 'USD' ? montoUsd : montoBs;
    if (metodoDevolucion === 'efectivo_bs') monto = redondearAPaso(monto, app.negocio?.pasoRedondeoBs ?? 100, 'cercano');
    return { valido: valido && alguno, monto, moneda };
  });

  function abrirDevolucion() {
    cantidades = {};
    motivoDevolucion = '';
    devolverAbierto = true;
  }

  async function devolver() {
    if (!completa) return;
    procesando = true;
    try {
      const items = completa.items
        .map((i) => ({ ventaItemId: i.id, cantidad: parsearDecimal(cantidades[i.id] ?? '', ESCALA.milesimas) ?? 0 }))
        .filter((i) => i.cantidad > 0);
      const d = await registrarDevolucion({ ventaId: id, items, metodo: metodoDevolucion, motivo: motivoDevolucion });
      avisar(`Devolución ${d.numero}: entrega ${formatearMonto(d.monto, d.moneda)} al cliente.`, 'exito', 7000);
      devolverAbierto = false;
      await cargar();
    } catch (e) {
      avisarError(e);
    } finally {
      procesando = false;
    }
  }
</script>

{#if !cargado}
  <p class="vacio">Cargando…</p>
{:else if !completa}
  <div class="vacio">
    <p>Esta venta no existe.</p>
    <p><a href="#/ventas">Volver a ventas</a></p>
  </div>
{:else}
  <div class="encabezado-pagina no-imprimir">
    <div class="fila">
      <a class="btn btn-fantasma" href="#/ventas" aria-label="Volver"><Icono nombre="atras" /></a>
      <h1>Venta {completa.venta.numero}</h1>
      {#if completa.venta.estado === 'anulada'}<span class="chip chip-agotado">Anulada</span>{/if}
    </div>
    <div class="fila">
      <button class="btn" onclick={() => window.print()}><Icono nombre="imprimir" /> Imprimir</button>
      {#if esCompletada && quedaPorDevolver && puede('ventas.devolver')}
        <button class="btn" onclick={abrirDevolucion} disabled={!caja.sesion} title={caja.sesion ? '' : 'Abre la caja primero'}>
          <Icono nombre="deshacer" /> Devolución
        </button>
      {/if}
      {#if esCompletada && completa.devoluciones.length === 0 && puede('ventas.anular')}
        <button class="btn btn-peligro" onclick={() => (anularAbierto = true)} disabled={!caja.sesion} title={caja.sesion ? '' : 'Abre la caja primero'}>
          Anular
        </button>
      {/if}
    </div>
  </div>

  <div class="detalle">
    <Comprobante {completa} negocio={app.negocio} />

    {#if completa.devoluciones.length > 0 || completa.venta.estado === 'anulada'}
      <section class="pila-chica no-imprimir historial">
        <h2>Historial</h2>
        {#if completa.venta.estado === 'anulada'}
          <p>Anulada el {formatearFechaHora(completa.venta.anuladaEn!)} por {completa.venta.anuladaPorNombre}: {completa.venta.motivoAnulacion}</p>
        {/if}
        {#each completa.devoluciones as d (d.id)}
          <div class="tarjeta">
            <strong>{d.numero}</strong> · {formatearFechaHora(d.creadoEn)} · {METODOS_PAGO[d.metodo].nombre}:
            <strong class="num">{formatearMonto(d.monto, d.moneda)}</strong>
            <p class="ayuda">{d.motivo}</p>
            <ul class="ayuda">
              {#each completa.devolucionItems.filter((x) => x.devolucionId === d.id) as di (di.id)}
                {@const item = completa.items.find((i) => i.id === di.ventaItemId)}
                <li>{item?.descripcion}: {formatearCantidad(di.cantidad, item?.unidad)}</li>
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/if}
  </div>

  <Modal bind:abierto={anularAbierto} titulo="Anular venta {completa.venta.numero}">
    <p>Se devuelve el stock de todos los productos y se revierten los cobros en la caja abierta. La venta queda registrada como anulada.</p>
    <label class="campo">
      <span>Motivo *</span>
      <input bind:value={motivoAnular} maxlength="120" placeholder="Se registró por error" />
    </label>
    {#snippet acciones()}
      <button class="btn" onclick={() => (anularAbierto = false)}>Cancelar</button>
      <button class="btn btn-peligro" disabled={procesando || !motivoAnular.trim()} onclick={anular}>Anular venta</button>
    {/snippet}
  </Modal>

  <Modal bind:abierto={devolverAbierto} titulo="Devolución">
    <p class="ayuda">Indica cuánto devuelve el cliente de cada producto. El stock vuelve al inventario.</p>
    <div class="pila-chica">
      {#each completa.items as item (item.id)}
        {@const restante = item.cantidad - (devueltoPorItem.get(item.id) ?? 0)}
        {#if restante > 0}
          <label class="fila-devolucion">
            <span>{item.descripcion} <span class="ayuda">(máx. {formatearCantidad(restante, item.unidad)})</span></span>
            <input
              bind:value={cantidades[item.id]}
              inputmode="decimal"
              class="num"
              placeholder="0"
              aria-label="Cantidad a devolver de {item.descripcion}"
            />
          </label>
        {/if}
      {/each}
    </div>
    <label class="campo">
      <span>Cómo se reintegra el dinero</span>
      <select bind:value={metodoDevolucion}>
        {#each METODOS_DEVOLUCION as m}
          <option value={m}>{METODOS_PAGO[m].nombre}</option>
        {/each}
      </select>
    </label>
    <label class="campo">
      <span>Motivo *</span>
      <input bind:value={motivoDevolucion} maxlength="120" placeholder="Producto dañado" />
    </label>
    {#if vistaDevolucion.valido}
      <div class="alerta alerta-info">
        Entregar al cliente: <strong class="num">{formatearMonto(vistaDevolucion.monto, vistaDevolucion.moneda)}</strong>
      </div>
    {/if}
    {#snippet acciones()}
      <button class="btn" onclick={() => (devolverAbierto = false)}>Cancelar</button>
      <button class="btn btn-primario" disabled={procesando || !vistaDevolucion.valido || !motivoDevolucion.trim()} onclick={devolver}>
        Registrar devolución
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  .detalle {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .historial {
    flex: 1;
    min-width: 260px;
  }

  .historial ul {
    margin: 0.25rem 0 0;
    padding-left: 1.1rem;
  }

  .fila-devolucion {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .fila-devolucion input {
    width: 90px;
    text-align: right;
  }
</style>
