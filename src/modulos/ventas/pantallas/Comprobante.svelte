<script lang="ts">
  import { formatearBs, formatearCantidad, formatearTasa, formatearUsd } from '../../../core/dinero/dinero';
  import type { ConfigNegocio } from '../../../core/db/tipos';
  import { formatearMonto, METODOS_PAGO } from '../../../core/pagos';
  import { formatearFecha, formatearFechaHora } from '../../../core/util/fechas';
  import type { VentaCompleta } from '../servicio';

  let { completa, negocio }: { completa: VentaCompleta; negocio: ConfigNegocio | null } = $props();

  const v = $derived(completa.venta);
  const cobros = $derived(completa.pagos.filter((p) => !p.esVuelto));
  const vueltos = $derived(completa.pagos.filter((p) => p.esVuelto));
</script>

<article class="comprobante" class:anulada={v.estado === 'anulada'}>
  <header>
    <strong class="negocio">{negocio?.nombre}</strong>
    {#if negocio?.rif}<span>RIF {negocio.rif}</span>{/if}
    {#if negocio?.direccion}<span>{negocio.direccion}</span>{/if}
    {#if negocio?.telefono}<span>Tel. {negocio.telefono}</span>{/if}
  </header>

  <div class="separador"></div>
  <div class="fila-c"><span>Comprobante</span><strong class="mono">{v.numero}</strong></div>
  <div class="fila-c"><span>Fecha</span><span>{formatearFechaHora(v.creadoEn)}</span></div>
  <div class="fila-c"><span>Atendió</span><span>{v.usuarioNombre}</span></div>
  {#if v.estado === 'anulada'}
    <div class="sello">ANULADA</div>
    <p class="nota">Motivo: {v.motivoAnulacion}</p>
  {/if}

  <div class="separador"></div>
  <ul class="items">
    {#each completa.items as item (item.id)}
      <li>
        <span class="desc">{item.descripcion}</span>
        <div class="fila-c">
          <span class="num">{formatearCantidad(item.cantidad, item.unidad)} × {formatearBs(item.precioUnitarioBs)}</span>
          <strong class="num">{formatearBs(item.subtotalBs)}</strong>
        </div>
      </li>
    {/each}
  </ul>

  <div class="separador"></div>
  <div class="fila-c total"><span>TOTAL</span><strong class="num">{formatearBs(v.totalBs)}</strong></div>
  <div class="fila-c"><span>Equivale a</span><span class="num">{formatearUsd(v.totalUsd)}</span></div>
  <div class="fila-c pequeno"><span>Tasa BCV ({formatearFecha(v.tasaFechaValor)})</span><span class="num">{formatearTasa(v.tasa)}</span></div>

  <div class="separador"></div>
  {#each cobros as p (p.id)}
    <div class="fila-c">
      <span>{METODOS_PAGO[p.metodo].nombre}{p.referencia ? ` · ref. ${p.referencia}` : ''}</span>
      <span class="num">{formatearMonto(p.monto, p.moneda)}</span>
    </div>
  {/each}
  {#each vueltos as p (p.id)}
    <div class="fila-c">
      <span>Vuelto ({METODOS_PAGO[p.metodo].nombre})</span>
      <span class="num">−{formatearMonto(p.monto, p.moneda)}</span>
    </div>
  {/each}

  {#if completa.devoluciones.length > 0}
    <div class="separador"></div>
    {#each completa.devoluciones as d (d.id)}
      <div class="fila-c">
        <span>Devolución {d.numero}</span>
        <span class="num">−{formatearMonto(d.monto, d.moneda)}</span>
      </div>
    {/each}
  {/if}

  <div class="separador"></div>
  <p class="pie">Comprobante interno. No es una factura fiscal.</p>
</article>

<style>
  .comprobante {
    width: 100%;
    max-width: 360px;
    padding: 1rem 1.1rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
    font-size: 0.92rem;
    position: relative;
  }

  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.1rem;
  }

  .negocio {
    font-size: 1.1rem;
  }

  .separador {
    border-top: 1px dashed var(--borde);
    margin: 0.6rem 0;
  }

  .fila-c {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .desc {
    display: block;
  }

  .total {
    font-size: 1.2rem;
  }

  .pequeno,
  .pie,
  .nota {
    font-size: 0.8rem;
    color: var(--texto-suave);
  }

  .pie {
    text-align: center;
  }

  .sello {
    margin: 0.5rem 0 0.25rem;
    padding: 0.25rem;
    border: 2px solid var(--peligro);
    color: var(--peligro);
    text-align: center;
    font-weight: 800;
    letter-spacing: 0.2em;
  }

  .anulada .items,
  .anulada .total {
    text-decoration: line-through;
    opacity: 0.7;
  }
</style>
