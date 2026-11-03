<script lang="ts">
  import { untrack } from 'svelte';
  import { app, tasaDelDia } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { ESCALA, formatearCosto, formatearParaEditar, formatearTasa, parsearDecimal } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO, ORDEN_METODOS, type MetodoPago } from '../../../core/pagos';
  import { formatearFecha, formatearFechaHora } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { compras } from '../almacen.svelte';
  import { aMonedaDeuda, desdeMonedaDeuda, toleranciaConversion, urgencia } from '../calculos';
  import { cantidadDeLinea, obtenerCompra, registrarPagoCompra, type CompraCompleta } from '../servicio';
  import { NOMBRE_ESTADO_PAGO } from '../tipos';

  let { params }: PropsPantalla = $props();
  const id = untrack(() => params.id)!;
  const tasa = $derived(tasaDelDia());

  let completa = $state<CompraCompleta | null>(null);
  let cargado = $state(false);

  $effect(() => {
    void compras.version;
    void obtenerCompra(id).then((c) => {
      completa = c;
      cargado = true;
    });
  });

  const saldo = $derived(completa ? completa.compra.total - completa.compra.pagado : 0);
  const u = $derived(completa ? urgencia(completa.compra.vencimiento, app.hoy) : 'sin_fecha');

  // ── Pago ──
  let pagoAbierto = $state(false);
  let pago = $state({ metodo: 'efectivo_usd' as MetodoPago, monto: '', desdeCaja: true, referencia: '', nota: '' });
  let guardando = $state(false);
  const monedaPago = $derived(METODOS_PAGO[pago.metodo].moneda);
  const montoPago = $derived(parsearDecimal(pago.monto, ESCALA.centavos));
  // Igual que el servicio: si lo que queda es menos que la unidad mínima del método, la deuda se salda.
  const aplicado = $derived.by(() => {
    if (!completa || !montoPago || tasa === null) return null;
    const bruto = aMonedaDeuda(montoPago, monedaPago, completa.compra.moneda, tasa);
    const tolerancia = toleranciaConversion(monedaPago, completa.compra.moneda, tasa);
    return saldo - bruto < tolerancia && bruto - saldo <= tolerancia ? saldo : bruto;
  });

  function abrirPago() {
    pago = { metodo: 'efectivo_usd', monto: '', desdeCaja: !!caja.sesion, referencia: '', nota: '' };
    pagoAbierto = true;
  }

  function pagarTodo() {
    if (!completa || tasa === null) return;
    pago.monto = formatearParaEditar(desdeMonedaDeuda(saldo, completa.compra.moneda, monedaPago, tasa), ESCALA.centavos);
  }

  async function guardarPago() {
    if (!montoPago) return;
    guardando = true;
    try {
      await registrarPagoCompra(id, { ...pago, monto: montoPago });
      avisar('Pago registrado.');
      pagoAbierto = false;
    } catch (e) {
      avisarError(e);
    } finally {
      guardando = false;
    }
  }
</script>

{#if !cargado}
  <p class="vacio">Cargando…</p>
{:else if !completa}
  <div class="vacio">
    <p>Esta compra no existe.</p>
    <p><a href="#/compras">Volver a compras</a></p>
  </div>
{:else}
  {@const c = completa.compra}
  <div class="encabezado-pagina">
    <div class="fila">
      <a class="btn btn-fantasma" href="#/compras" aria-label="Volver"><Icono nombre="atras" /></a>
      <h1>Compra {c.numero}</h1>
      <span class="chip" class:chip-normal={c.estadoPago === 'pagada'} class:chip-bajo={c.estadoPago === 'parcial'} class:chip-agotado={c.estadoPago === 'pendiente'}>
        {NOMBRE_ESTADO_PAGO[c.estadoPago]}
      </span>
    </div>
    {#if c.estadoPago !== 'pagada'}
      <button class="btn btn-primario" onclick={abrirPago}>Registrar pago</button>
    {/if}
  </div>

  <div class="datos">
    <div class="tarjeta pila-chica">
      <span class="suave">Proveedor</span>
      <a href="#/compras?proveedor={c.proveedorId}"><strong>{completa.proveedor?.nombre}</strong></a>
      {#if completa.proveedor?.telefono}<span class="ayuda">Tel. {completa.proveedor.telefono}</span>{/if}
    </div>
    <div class="tarjeta pila-chica">
      <span class="suave">Factura</span>
      <strong>{c.facturaProveedor || '—'}</strong>
      <span class="ayuda">{formatearFecha(c.fecha)} · tasa {formatearTasa(c.tasa)}</span>
    </div>
    <div class="tarjeta pila-chica">
      <span class="suave">Por pagar</span>
      <strong class="num grande" class:deuda={saldo > 0}>{formatearMonto(saldo, c.moneda)}</strong>
      <span class="ayuda num">de {formatearMonto(c.total, c.moneda)}{c.moneda === 'VES' ? ' (Bs fijo)' : ''}</span>
      {#if c.vencimiento && c.estadoPago !== 'pagada'}
        <span class="chip" class:chip-agotado={u === 'vencida'} class:chip-bajo={u === 'pronto'}>
          {u === 'vencida' ? 'Venció' : 'Vence'} el {formatearFecha(c.vencimiento)}
        </span>
      {/if}
    </div>
  </div>

  <h2 class="subtitulo">Productos</h2>
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr><th>Producto</th><th class="derecha">Cantidad</th><th class="derecha">Costo c/u</th><th class="derecha">Subtotal</th><th class="derecha ocultable">Costo por unidad</th></tr>
      </thead>
      <tbody>
        {#each completa.items as item (item.id)}
          <tr>
            <td><a href="#/productos/{item.productoId}">{item.descripcion}</a></td>
            <td class="derecha num">{cantidadDeLinea(item)}</td>
            <td class="derecha num">{formatearMonto(item.costoUnitario, c.moneda)}</td>
            <td class="derecha num">{formatearMonto(item.subtotal, c.moneda)}</td>
            <td class="derecha num ocultable suave">{formatearCosto(item.costoBaseUsd)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h2 class="subtitulo">Pagos</h2>
  {#if completa.pagos.length === 0}
    <p class="vacio">Sin pagos todavía.</p>
  {:else}
    <div class="tabla-contenedor">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Método</th><th class="derecha">Monto</th><th class="derecha">Descontó</th><th class="ocultable">Detalle</th></tr>
        </thead>
        <tbody>
          {#each completa.pagos as p (p.id)}
            <tr>
              <td class="suave">{formatearFechaHora(p.creadoEn)}</td>
              <td>{METODOS_PAGO[p.metodo].nombre}</td>
              <td class="derecha num">{formatearMonto(p.monto, METODOS_PAGO[p.metodo].moneda)}</td>
              <td class="derecha num">{formatearMonto(p.aplicado, c.moneda)}</td>
              <td class="ocultable suave">
                {p.desdeCaja ? 'De la caja' : 'Fuera de caja'}{p.referencia ? ` · ref. ${p.referencia}` : ''}{p.nota ? ` · ${p.nota}` : ''}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  {#if c.notas}<p class="ayuda">Notas: {c.notas}</p>{/if}

  <Modal bind:abierto={pagoAbierto} titulo="Pago a {completa.proveedor?.nombre}">
    <p>Se debe <strong class="num">{formatearMonto(saldo, c.moneda)}</strong> de esta compra.</p>
    <div class="rejilla">
      <label class="campo">
        <span>Paga con</span>
        <select bind:value={pago.metodo} onchange={() => (pago.desdeCaja = METODOS_PAGO[pago.metodo].efectivo && !!caja.sesion)}>
          {#each ORDEN_METODOS as m}<option value={m}>{METODOS_PAGO[m].nombre}</option>{/each}
        </select>
      </label>
      <label class="campo">
        <span>Monto ({monedaPago === 'USD' ? '$' : 'Bs'})</span>
        <input bind:value={pago.monto} inputmode="decimal" class="num" aria-invalid={pago.monto !== '' && !montoPago} />
      </label>
    </div>
    <button type="button" class="btn btn-chico" onclick={pagarTodo}>Pagar todo</button>
    {#if METODOS_PAGO[pago.metodo].referencia}
      <label class="campo">
        <span>Referencia</span>
        <input bind:value={pago.referencia} inputmode="numeric" maxlength="20" />
      </label>
    {/if}
    <label class="casilla">
      <input type="checkbox" bind:checked={pago.desdeCaja} disabled={!caja.sesion} />
      Sale de la gaveta de la caja {#if !caja.sesion}<span class="ayuda">(la caja está cerrada)</span>{/if}
    </label>
    {#if aplicado !== null && aplicado > saldo}
      <div class="alerta alerta-peligro">El pago supera lo que se debe.</div>
    {:else if aplicado !== null && aplicado === saldo}
      <div class="alerta alerta-info">Con este pago la compra queda saldada.</div>
    {:else if aplicado !== null && monedaPago !== c.moneda}
      <p class="ayuda">Descuenta <strong class="num">{formatearMonto(aplicado, c.moneda)}</strong> de la deuda (tasa de hoy).</p>
    {/if}
    {#snippet acciones()}
      <button class="btn" onclick={() => (pagoAbierto = false)}>Cancelar</button>
      <button class="btn btn-primario" disabled={guardando || !montoPago} onclick={guardarPago}>Registrar pago</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .datos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .grande {
    font-size: 1.6rem;
  }

  .deuda {
    color: var(--peligro);
  }

  .subtitulo {
    margin: 1.25rem 0 0.5rem;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
