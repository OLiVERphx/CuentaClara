<script lang="ts">
  import { app, tasaDelDia } from '../../../app/estado.svelte';
  import { formatearBs, formatearCantidad, formatearDecimal, formatearPorcentaje, formatearUsd, usdABs } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO } from '../../../core/pagos';
  import { formatearFecha } from '../../../core/util/fechas';
  import BarrasHorizontales from '../../../ui/BarrasHorizontales.svelte';
  import GraficoColumnas from '../../../ui/GraficoColumnas.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { clientes } from '../../clientes/almacen.svelte';
  import { compras } from '../../compras/almacen.svelte';
  import { listarCompras } from '../../compras/servicio';
  import type { Compra } from '../../compras/tipos';
  import { inventario } from '../../inventario/almacen.svelte';
  import { NOMBRE_PERIODO, rangoDe, resumirInventario, resumirPeriodo, type Periodo, type ResumenPeriodo } from '../calculos';
  import { cargarPeriodo } from '../consultas';

  let periodo = $state<Periodo | 'personalizado'>('hoy');
  let desdeManual = $state(app.hoy);
  let hastaManual = $state(app.hoy);
  let moneda = $state<'USD' | 'VES'>('USD');

  const rango = $derived(periodo === 'personalizado' ? { desde: desdeManual, hasta: hastaManual } : rangoDe(periodo, app.hoy));

  let resumen = $state<ResumenPeriodo | null>(null);
  let cargando = $state(false);
  let pendientes = $state<Compra[]>([]);

  $effect(() => {
    const { desde, hasta } = rango;
    void caja.version; // se actualiza al vender, anular o devolver
    if (!desde || !hasta || desde > hasta) return;
    cargando = true;
    void cargarPeriodo(desde, hasta).then((datos) => {
      resumen = resumirPeriodo(datos, desde, hasta);
      cargando = false;
    });
  });

  $effect(() => {
    void compras.version;
    void listarCompras({ soloPendientes: true }).then((r) => (pendientes = r));
  });

  const foto = $derived.by(() => {
    void inventario.version;
    const inv = resumirInventario(inventario.indice.todos());
    const fiao = clientes.lista.reduce((s, c) => s + Math.max(c.saldoUsd, 0), 0);
    const debesUsd = pendientes.filter((c) => c.moneda === 'USD').reduce((s, c) => s + c.total - c.pagado, 0);
    const debesBs = pendientes.filter((c) => c.moneda === 'VES').reduce((s, c) => s + c.total - c.pagado, 0);
    return { ...inv, fiao, debesUsd, debesBs };
  });

  const tasa = $derived(tasaDelDia());

  /** Etiquetas compactas del eje: $1,2K · Bs 15M. */
  function compacto(valor: number, enUsd: boolean): string {
    const unidades = valor / 100;
    const [div, sufijo] = unidades >= 1e6 ? [1e6, 'M'] : unidades >= 1e3 ? [1e3, 'K'] : [1, ''];
    const texto = formatearDecimal(Math.round((unidades / div) * 10), 1).replace(/,0$/, '');
    return `${enUsd ? '$' : 'Bs '}${texto}${sufijo}`;
  }

  const puntosDia = $derived(
    (resumen?.porDia ?? []).map((d) => ({
      etiqueta: formatearFecha(d.fecha),
      corta: d.fecha.slice(8, 10),
      valor: moneda === 'USD' ? d.usd : d.bs,
      detalle: `${d.ventas} ${d.ventas === 1 ? 'venta' : 'ventas'}`,
    })),
  );

  const barrasMetodos = $derived.by(() => {
    if (!resumen) return [];
    const cobrados = resumen.porMetodo.filter((m) => m.monto > 0);
    const total = cobrados.reduce((s, m) => s + m.equivalenteBs, 0) || 1;
    return cobrados
      .sort((a, b) => b.equivalenteBs - a.equivalenteBs)
      .map((m) => ({
        etiqueta: METODOS_PAGO[m.metodo].nombre,
        valor: m.equivalenteBs,
        texto: formatearMonto(m.monto, METODOS_PAGO[m.metodo].moneda),
        detalle: formatearPorcentaje(Math.round((m.equivalenteBs / total) * 10_000)),
      }));
  });
  const vueltos = $derived((resumen?.porMetodo ?? []).filter((m) => m.vuelto > 0));

  const barrasProductos = $derived(
    (resumen?.productos ?? []).slice(0, 10).map((p) => {
      const unidad = inventario.indice.obtener(p.productoId)?.producto.unidad;
      return {
        etiqueta: p.descripcion,
        valor: p.ventasUsd,
        texto: formatearUsd(p.ventasUsd),
        detalle: `${formatearCantidad(p.cantidadBase, unidad)} · gana ${formatearUsd(p.gananciaUsd)}`,
        enlace: `#/productos/${p.productoId}`,
      };
    }),
  );
</script>

<div class="encabezado-pagina">
  <h1>Reportes</h1>
</div>

<div class="filtros">
  <select bind:value={periodo} aria-label="Período">
    {#each Object.entries(NOMBRE_PERIODO) as [valor, nombre]}<option value={valor}>{nombre}</option>{/each}
    <option value="personalizado">Personalizado…</option>
  </select>
  {#if periodo === 'personalizado'}
    <input type="date" bind:value={desdeManual} max={hastaManual} aria-label="Desde" />
    <input type="date" bind:value={hastaManual} min={desdeManual} max={app.hoy} aria-label="Hasta" />
  {/if}
  <div class="segmentado" role="radiogroup" aria-label="Moneda de los gráficos">
    <label><input type="radio" bind:group={moneda} value="USD" /> $</label>
    <label><input type="radio" bind:group={moneda} value="VES" /> Bs</label>
  </div>
  <span class="ayuda">{formatearFecha(rango.desde)}{rango.desde !== rango.hasta ? ` al ${formatearFecha(rango.hasta)}` : ''}</span>
</div>

{#if resumen}
  <div class="contenido" class:recargando={cargando}>
    <section class="tarjeta heroe">
      <span class="suave">Ventas netas</span>
      <strong class="num cifra">{moneda === 'USD' ? formatearUsd(resumen.netoUsd) : formatearBs(resumen.netoBs)}</strong>
      <span class="num suave">{moneda === 'USD' ? formatearBs(resumen.netoBs) : formatearUsd(resumen.netoUsd)} · {resumen.ventas} {resumen.ventas === 1 ? 'venta' : 'ventas'}</span>
    </section>

    <div class="datos">
      <div class="tarjeta dato">
        <span class="suave">Ticket promedio</span>
        <strong class="num">{formatearUsd(resumen.ticketPromedioUsd)}</strong>
      </div>
      <div class="tarjeta dato">
        <span class="suave">Ganancia bruta</span>
        <strong class="num">{formatearUsd(resumen.gananciaBrutaUsd)}</strong>
        <span class="ayuda">margen {resumen.margenBruto !== null ? formatearPorcentaje(resumen.margenBruto) : '—'}</span>
      </div>
      <div class="tarjeta dato">
        <span class="suave">Gastos</span>
        <strong class="num">{formatearUsd(resumen.gastosUsd)}</strong>
      </div>
      <div class="tarjeta dato">
        <span class="suave">Ganancia neta</span>
        <strong class="num" class:negativo={resumen.gananciaNetaUsd < 0}>{formatearUsd(resumen.gananciaNetaUsd)}</strong>
        <span class="ayuda">bruta − gastos</span>
      </div>
    </div>
    {#if resumen.devolucionesUsd || resumen.anuladas}
      <p class="ayuda">
        Ya descontadas: devoluciones por {formatearUsd(resumen.devolucionesUsd)}{resumen.anuladas ? ` y ${resumen.anuladas} ${resumen.anuladas === 1 ? 'venta anulada' : 'ventas anuladas'}` : ''}.
      </p>
    {/if}

    {#if resumen.porDia.length > 1}
      <section class="tarjeta">
        <GraficoColumnas
          titulo="Ventas netas por día ({moneda === 'USD' ? '$' : 'Bs'})"
          puntos={puntosDia}
          formatear={(v) => (moneda === 'USD' ? formatearUsd(v) : formatearBs(v))}
          formatearEje={(v) => compacto(v, moneda === 'USD')}
        />
      </section>
    {/if}

    <div class="dos">
      <section class="tarjeta pila-chica">
        <h2>Cobros por método</h2>
        {#if barrasMetodos.length === 0}<p class="vacio">Sin ventas en el período.</p>{:else}<BarrasHorizontales barras={barrasMetodos} />{/if}
        {#if vueltos.length > 0}
          <p class="ayuda">
            Vueltos entregados:
            {#each vueltos as m, i}{i > 0 ? ' · ' : ''}<strong class="num">{formatearMonto(m.vuelto, METODOS_PAGO[m.metodo].moneda)}</strong> ({METODOS_PAGO[m.metodo].nombre}){/each}
          </p>
        {/if}
        <p class="ayuda">«Fiado» es lo que quedó por cobrar.</p>
      </section>
      <section class="tarjeta pila-chica">
        <h2>Productos más vendidos</h2>
        {#if barrasProductos.length === 0}<p class="vacio">Sin ventas en el período.</p>{:else}<BarrasHorizontales barras={barrasProductos} />{/if}
      </section>
    </div>
  </div>
{/if}

<h2 class="subtitulo">Cómo está el negocio ahora</h2>
<div class="datos">
  <div class="tarjeta dato">
    <span class="suave">Mercancía (a costo)</span>
    <strong class="num">{formatearUsd(foto.valorUsd)}</strong>
    {#if tasa !== null}<span class="ayuda num">≈ {formatearBs(usdABs(foto.valorUsd, tasa))}</span>{/if}
  </div>
  <a class="tarjeta dato enlace" href="#/inventario/reponer">
    <span class="suave">Por reponer</span>
    <strong class="num">{foto.agotados + foto.bajos}</strong>
    <span class="ayuda">{foto.agotados} agotados · {foto.bajos} bajos</span>
  </a>
  <a class="tarjeta dato enlace" href="#/clientes">
    <span class="suave">Te deben (fiao)</span>
    <strong class="num">{formatearUsd(foto.fiao)}</strong>
  </a>
  <a class="tarjeta dato enlace" href="#/compras">
    <span class="suave">Debes a proveedores</span>
    <strong class="num">{formatearUsd(foto.debesUsd)}</strong>
    {#if foto.debesBs}<span class="ayuda num">+ {formatearBs(foto.debesBs)} en Bs fijo</span>{/if}
  </a>
</div>

<style>
  .filtros {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .filtros select,
  .filtros input {
    width: auto;
  }

  .contenido {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: opacity 0.15s;
  }

  .recargando {
    opacity: 0.6;
  }

  .heroe {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .cifra {
    font-size: 3rem;
    line-height: 1.1;
  }

  .datos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.75rem;
  }

  .dato {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .dato strong {
    font-size: 1.4rem;
  }

  .enlace {
    color: inherit;
    text-decoration: none;
  }

  .enlace:hover {
    border-color: var(--primario);
  }

  .negativo {
    color: var(--peligro);
  }

  .dos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .subtitulo {
    margin: 1.75rem 0 0.75rem;
  }
</style>
