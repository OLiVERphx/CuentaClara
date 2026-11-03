<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import { formatearBs, formatearCantidad, formatearUsd } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO } from '../../../core/pagos';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { clientes } from '../../clientes/almacen.svelte';
  import SelectorCliente from '../../clientes/pantallas/SelectorCliente.svelte';
  import { inventario } from '../../inventario/almacen.svelte';
  import type { Presentacion, Producto } from '../../inventario/tipos';
  import { ticket } from '../almacen.svelte';
  import { calcularLinea, errorCantidad, lineaDesdeProducto, totalizar, type PagoTicket } from '../calculos';
  import { registrarVenta, type VentaCompleta } from '../servicio';
  import Cobro from './Cobro.svelte';

  const tasa = $derived(tasaDelDia());
  const redondeo = $derived(redondeoBs());

  let consulta = $state('');
  let activo = $state(0);
  let buscador = $state<HTMLInputElement>();
  let cobrando = $state(false);
  let ultima = $state<VentaCompleta | null>(null);
  let verUltima = $state(false);

  interface Opcion {
    producto: Producto;
    presentacion: Presentacion | null;
  }

  const opciones = $derived.by((): Opcion[] => {
    void inventario.version;
    if (!consulta.trim()) return [];
    const salida: Opcion[] = [];
    for (const r of inventario.indice.buscar(consulta, { limite: 8 })) {
      if (r.presentacionExacta) {
        salida.push({ producto: r.producto, presentacion: r.presentacionExacta });
        continue;
      }
      salida.push({ producto: r.producto, presentacion: null });
      for (const p of r.presentaciones) if (p.paraVenta) salida.push({ producto: r.producto, presentacion: p });
    }
    return salida.slice(0, 12);
  });

  const lineas = $derived.by(() => {
    void inventario.version;
    if (tasa === null) return [];
    return ticket.lineas.flatMap((entrada) => {
      const r = inventario.indice.obtener(entrada.productoId);
      if (!r) return [];
      const presentacion = entrada.presentacionId ? (r.presentaciones.find((p) => p.id === entrada.presentacionId) ?? null) : null;
      if (entrada.presentacionId && !presentacion) return [];
      const linea = lineaDesdeProducto(r.producto, presentacion, entrada.cantidad);
      return [{ entrada, producto: r.producto, calc: calcularLinea(linea, tasa, redondeo), error: errorCantidad(linea) }];
    });
  });

  const totales = $derived(totalizar(lineas.map((l) => l.calc)));
  const hayErrores = $derived(lineas.some((l) => l.error));
  const puedeCobrar = $derived(lineas.length > 0 && !hayErrores && caja.sesion !== null && tasa !== null);

  /** Lo que el ticket saca del stock de cada producto (varias líneas pueden ser del mismo). */
  const pedidoPorProducto = $derived.by(() => {
    const m = new Map<string, number>();
    for (const l of lineas) m.set(l.producto.id, (m.get(l.producto.id) ?? 0) + l.calc.cantidadBase);
    return m;
  });

  onMount(() => {
    buscador?.focus();
  });

  function precioOpcion(o: Opcion): string {
    if (tasa === null) return '';
    const linea = calcularLinea(lineaDesdeProducto(o.producto, o.presentacion, 1000), tasa, redondeo);
    return `${formatearBs(linea.precioUnitarioBs)} · ${formatearUsd(linea.subtotalUsd)}`;
  }

  async function agregar(o: Opcion) {
    const clave = ticket.agregar(o.producto.id, o.presentacion?.id ?? null);
    consulta = '';
    activo = 0;
    await tick();
    if (!o.presentacion && o.producto.unidad === 'kg') {
      // Por peso: el foco va a la cantidad para escribir los kilos.
      const campo = document.querySelector<HTMLInputElement>(`[data-cantidad="${clave}"]`);
      campo?.focus();
      campo?.select();
    } else {
      buscador?.focus();
    }
  }

  function alTeclearBusqueda(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') activo = Math.min(activo + 1, opciones.length - 1);
    else if (e.key === 'ArrowUp') activo = Math.max(activo - 1, 0);
    else if (e.key === 'Enter' && opciones[activo]) void agregar(opciones[activo]!);
    else if (e.key === 'Enter' && !consulta.trim() && puedeCobrar) cobrando = true;
    else if (e.key === 'Escape') consulta = '';
    else return;
    e.preventDefault();
  }

  function alTeclearCantidad(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscador?.focus();
    }
  }

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'F4' && !cobrando) {
      e.preventDefault();
      if (puedeCobrar) cobrando = true;
    }
  }

  async function confirmar(pagos: PagoTicket[]): Promise<boolean> {
    try {
      ultima = await registrarVenta({
        lineas: ticket.lineas.map((l) => ({ productoId: l.productoId, presentacionId: l.presentacionId, cantidad: l.cantidad })),
        pagos,
        clienteId: ticket.clienteId,
      });
      ticket.vaciar();
      verUltima = true;
      return true;
    } catch (error) {
      avisarError(error);
      return false;
    }
  }

  function nuevaVenta() {
    verUltima = false;
    void tick().then(() => buscador?.focus());
  }
</script>

<svelte:window onkeydown={alTeclear} />

{#if !caja.sesion}
  <div class="alerta alerta-aviso aviso-caja">
    <Icono nombre="billete" />
    <span>La caja está cerrada. Ábrela para empezar a vender.</span>
    <a class="btn btn-primario btn-chico" href="#/caja">Abrir caja</a>
  </div>
{/if}
{#if tasa === null}
  <div class="alerta alerta-peligro aviso-caja">
    <Icono nombre="alerta" />
    <span>No hay tasa vigente: no se pueden calcular los precios en Bs.</span>
    <a class="btn btn-chico" href="#/config?seccion=tasa">Cargar tasa</a>
  </div>
{/if}

<div class="vender">
  <section class="zona-busqueda">
    <div class="buscador">
      <Icono nombre="buscar" tamano={22} />
      <input
        bind:this={buscador}
        bind:value={consulta}
        oninput={() => (activo = 0)}
        onkeydown={alTeclearBusqueda}
        data-busqueda
        type="search"
        placeholder="Producto o código de barras…"
        aria-label="Buscar producto para agregar"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-expanded={opciones.length > 0}
        aria-controls="opciones-venta"
      />
    </div>
    {#if opciones.length > 0}
      <ul class="opciones" id="opciones-venta" role="listbox">
        {#each opciones as o, i (o.producto.id + (o.presentacion?.id ?? ''))}
          <li role="option" aria-selected={i === activo}>
            <button type="button" class:activo={i === activo} onmousedown={(e) => e.preventDefault()} onclick={() => agregar(o)}>
              <span class="pila-chica nombre-opcion">
                <span>{o.producto.nombre}{#if o.presentacion}<strong> · {o.presentacion.nombre}</strong>{/if}</span>
                <span class="ayuda">
                  {o.presentacion ? `${formatearCantidad(o.presentacion.factor, o.producto.unidad)} c/u` : o.producto.unidad === 'kg' ? 'por kg' : 'unidad'}
                  · stock {formatearCantidad(o.producto.stock, o.producto.unidad)}
                </span>
              </span>
              <span class="num precio-opcion">{precioOpcion(o)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if consulta.trim()}
      <p class="vacio">No se encontró «{consulta}».</p>
    {:else}
      <p class="ayuda ayuda-teclas">
        <kbd>↑</kbd><kbd>↓</kbd> elegir · <kbd>Enter</kbd> agregar · <kbd>F4</kbd> cobrar · <kbd>F2</kbd> volver aquí
      </p>
    {/if}
  </section>

  <section class="ticket tarjeta">
    <div class="fila-separada">
      <h2>Ticket</h2>
      {#if ticket.lineas.length > 0}
        <button class="btn btn-fantasma btn-chico" onclick={() => ticket.vaciar()}><Icono nombre="basura" tamano={16} /> Vaciar</button>
      {/if}
    </div>
    <SelectorCliente bind:clienteId={ticket.clienteId} />

    {#if lineas.length === 0}
      <p class="vacio">Busca un producto y presiona Enter para agregarlo.</p>
    {:else}
      <ul class="lineas">
        {#each lineas as l (l.entrada.clave)}
          {@const pedido = pedidoPorProducto.get(l.producto.id) ?? 0}
          <li>
            <div class="desc">
              <span>{l.calc.descripcion}</span>
              <span class="ayuda num">{formatearBs(l.calc.precioUnitarioBs)} {l.calc.unidad === 'kg' ? 'por kg' : 'c/u'}</span>
              {#if pedido > l.producto.stock}
                <span class="chip chip-bajo">Stock en sistema: {formatearCantidad(l.producto.stock, l.producto.unidad)}</span>
              {/if}
              {#if l.error}<span class="chip chip-agotado">{l.error.replace(/^«.*?»: /, '')}</span>{/if}
            </div>
            <label class="cantidad">
              <span class="oculto-visual">Cantidad</span>
              <input
                value={l.entrada.texto}
                oninput={(e) => ticket.cambiarCantidad(l.entrada.clave, e.currentTarget.value)}
                onkeydown={alTeclearCantidad}
                data-cantidad={l.entrada.clave}
                inputmode="decimal"
                class="num"
                aria-invalid={!!l.error}
              />
              <span class="ayuda">{l.calc.unidad === 'kg' ? 'kg' : 'und'}</span>
            </label>
            <div class="subtotal num">
              <strong>{formatearBs(l.calc.subtotalBs)}</strong>
              <span class="ayuda">{formatearUsd(l.calc.subtotalUsd)}</span>
            </div>
            <button class="btn btn-fantasma btn-chico" aria-label="Quitar {l.calc.descripcion}" onclick={() => ticket.quitar(l.entrada.clave)}>
              <Icono nombre="cerrar" tamano={18} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="total">
      <div>
        <span class="suave">Total</span>
        <strong class="num total-bs">{formatearBs(totales.totalBs)}</strong>
        <span class="num total-usd">{formatearUsd(totales.totalUsd)}</span>
      </div>
      <button class="btn btn-primario btn-grande" disabled={!puedeCobrar} onclick={() => (cobrando = true)}>
        Cobrar <kbd>F4</kbd>
      </button>
    </div>
  </section>
</div>

{#if cobrando && tasa !== null}
  <Cobro {totales} {tasa} {redondeo} cliente={clientes.obtener(ticket.clienteId)} onConfirmar={confirmar} onCerrar={() => (cobrando = false)} />
{/if}

<Modal bind:abierto={verUltima} titulo="Venta registrada">
  {#if ultima}
    {@const vueltos = ultima.pagos.filter((p) => p.esVuelto)}
    <div class="pila-chica resumen-venta">
      <span class="mono">{ultima.venta.numero}</span>
      <strong class="num total-bs">{formatearBs(ultima.venta.totalBs)}</strong>
      <span class="num">{formatearUsd(ultima.venta.totalUsd)}</span>
    </div>
    {#if vueltos.length > 0}
      <div class="alerta alerta-aviso">
        <span>
          Entregar vuelto:
          {#each vueltos as p, i}{i > 0 ? ' + ' : ''}<strong class="num">{formatearMonto(p.monto, p.moneda)}</strong> ({METODOS_PAGO[p.metodo].nombre}){/each}
        </span>
      </div>
    {/if}
  {/if}
  {#snippet acciones()}
    <button class="btn" onclick={() => ultima && navegar(`/ventas/${ultima.venta.id}`)}><Icono nombre="recibo" /> Ver comprobante</button>
    <!-- svelte-ignore a11y_autofocus -->
    <button class="btn btn-primario" autofocus onclick={nuevaVenta}>Nueva venta <kbd>Enter</kbd></button>
  {/snippet}
</Modal>

<style>
  .aviso-caja {
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .aviso-caja span {
    flex: 1;
  }

  .vender {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .buscador {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0 0.9rem;
    border: 2px solid var(--primario);
    border-radius: var(--radio);
    background: var(--superficie);
    color: var(--primario);
  }

  .buscador input {
    border: 0;
    outline: none;
    min-height: 56px;
    font-size: 1.2rem;
    padding: 0;
    background: transparent;
  }

  .opciones {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0.25rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
  }

  .opciones button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    width: 100%;
    min-height: 52px;
    padding: 0.45rem 0.7rem;
    border: 0;
    border-radius: var(--radio-chico);
    background: transparent;
    color: var(--texto);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .opciones button:hover,
  .opciones button.activo {
    background: var(--primario-suave);
  }

  .nombre-opcion {
    gap: 0.05rem;
    min-width: 0;
  }

  .precio-opcion {
    white-space: nowrap;
    font-weight: 600;
  }

  .ayuda-teclas {
    margin-top: 0.75rem;
  }

  kbd {
    font-family: var(--mono);
    font-size: 0.75rem;
    padding: 0.05rem 0.35rem;
    margin: 0 0.1rem;
    border: 1px solid var(--borde);
    border-radius: 4px;
  }

  .ticket {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    position: sticky;
    top: 74px;
  }

  .lineas {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: calc(100vh - 340px);
    overflow-y: auto;
  }

  .lineas li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--borde);
  }

  .desc {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .cantidad {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .cantidad input {
    width: 76px;
    text-align: right;
    font-weight: 600;
  }

  .subtotal {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 96px;
  }

  .total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding-top: 0.5rem;
  }

  .total > div {
    display: flex;
    flex-direction: column;
  }

  .total-bs {
    font-size: 2rem;
    line-height: 1.1;
    color: var(--primario);
  }

  .total-usd {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .resumen-venta {
    align-items: center;
    text-align: center;
  }

  @media (max-width: 900px) {
    .vender {
      grid-template-columns: 1fr;
    }

    .ticket {
      position: static;
    }

    .lineas {
      max-height: none;
    }

    .lineas li {
      grid-template-columns: 1fr auto auto;
    }

    .lineas li .desc {
      grid-column: 1 / -1;
    }
  }
</style>
