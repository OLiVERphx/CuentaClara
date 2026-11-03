<script lang="ts">
  import { app, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import {
    ESCALA,
    formatearCantidad,
    formatearCosto,
    formatearParaEditar,
    multiplicarCantidad,
    parsearDecimal,
    proporcional,
    usdABs,
  } from '../../../core/dinero/dinero';
  import { ErrorNegocio } from '../../../core/errores';
  import { formatearMonto, METODOS_PAGO, ORDEN_METODOS, type MetodoPago, type Moneda } from '../../../core/pagos';
  import { sumarDias } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { inventario } from '../../inventario/almacen.svelte';
  import SelectorProducto from '../../inventario/pantallas/SelectorProducto.svelte';
  import type { Producto } from '../../inventario/tipos';
  import { compras } from '../almacen.svelte';
  import { costoBaseUsd, desdeMonedaDeuda } from '../calculos';
  import { guardarProveedor, registrarCompra } from '../servicio';

  const tasa = $derived(tasaDelDia());

  let proveedorId = $state('');
  let fecha = $state(app.hoy);
  let factura = $state('');
  let moneda = $state<Moneda>('USD');
  let notas = $state('');

  interface Linea {
    clave: number;
    producto: Producto;
    presentacionId: string;
    cantidad: string;
    costo: string;
  }
  let lineas = $state<Linea[]>([]);
  let siguiente = 1;
  let elegido = $state<Producto | null>(null);

  // Al elegir un producto en el buscador se agrega una línea y el buscador se limpia.
  $effect(() => {
    const p = elegido;
    if (!p) return;
    const compra = inventario.indice.obtener(p.id)?.presentaciones.find((x) => x.paraCompra);
    lineas.push({ clave: siguiente++, producto: p, presentacionId: compra?.id ?? '', cantidad: '', costo: '' });
    elegido = null;
  });

  function presentacionesDe(p: Producto) {
    return inventario.indice.obtener(p.id)?.presentaciones.filter((x) => x.paraCompra) ?? [];
  }

  function factorDe(l: Linea): number {
    return presentacionesDe(l.producto).find((x) => x.id === l.presentacionId)?.factor ?? 1000;
  }

  /** Costo actual de una unidad de la línea, en la moneda de la compra (como referencia). */
  function costoActual(l: Linea): number {
    const centavos = proporcional(l.producto.costoPromedio, factorDe(l), 100_000);
    return moneda === 'USD' ? centavos : tasa !== null ? usdABs(centavos, tasa) : 0;
  }

  const calculadas = $derived(
    lineas.map((l) => {
      const cantidad = parsearDecimal(l.cantidad, ESCALA.milesimas);
      const costo = parsearDecimal(l.costo, ESCALA.centavos);
      const factor = factorDe(l);
      const subtotal = cantidad !== null && costo !== null ? multiplicarCantidad(costo, cantidad) : null;
      const nuevoCosto = costo !== null && tasa !== null ? costoBaseUsd(costo, moneda, factor, tasa) : null;
      return { l, cantidad, costo, factor, subtotal, nuevoCosto };
    }),
  );
  const total = $derived(calculadas.reduce((s, c) => s + (c.subtotal ?? 0), 0));
  const lineasValidas = $derived(calculadas.length > 0 && calculadas.every((c) => c.cantidad && c.cantidad > 0 && c.costo !== null));

  // ── Condición de pago ──
  let condicion = $state<'credito' | 'pagada' | 'parcial'>('credito');
  let metodo = $state<MetodoPago>('efectivo_usd');
  let montoParcial = $state('');
  let desdeCaja = $state(true);
  let referencia = $state('');
  let vencimiento = $state(sumarDias(app.hoy, 7));

  const monedaPago = $derived(METODOS_PAGO[metodo].moneda);
  const montoPago = $derived.by(() => {
    if (condicion === 'credito') return null;
    if (condicion === 'pagada') return tasa !== null ? desdeMonedaDeuda(total, moneda, monedaPago, tasa) : null;
    return parsearDecimal(montoParcial, ESCALA.centavos);
  });

  function cambiarMetodo() {
    desdeCaja = METODOS_PAGO[metodo].efectivo;
  }

  // ── Proveedor nuevo ──
  let proveedorAbierto = $state(false);
  let nuevoProveedor = $state({ nombre: '', rif: '', telefono: '' });

  async function crearProveedor() {
    try {
      const p = await guardarProveedor(null, { ...nuevoProveedor, contacto: '', nota: '', activo: true });
      await compras.cargar();
      proveedorId = p.id;
      proveedorAbierto = false;
    } catch (e) {
      avisarError(e);
    }
  }

  let guardando = $state(false);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    guardando = true;
    try {
      if (!proveedorId) throw new ErrorNegocio('Elige el proveedor.');
      if (!lineasValidas) throw new ErrorNegocio('Revisa las cantidades y costos de los productos.');
      if (condicion !== 'credito' && !montoPago) throw new ErrorNegocio('Indica el monto pagado.');
      const r = await registrarCompra({
        proveedorId,
        fecha,
        facturaProveedor: factura,
        moneda,
        items: calculadas.map((c) => ({
          productoId: c.l.producto.id,
          presentacionId: c.l.presentacionId || null,
          cantidad: c.cantidad!,
          costoUnitario: c.costo!,
        })),
        vencimiento: condicion === 'pagada' ? null : vencimiento || null,
        pagoInicial: condicion === 'credito' ? null : { metodo, monto: montoPago!, desdeCaja, referencia },
        notas,
      });
      avisar(`Compra ${r.compra.numero} registrada. El stock ya se actualizó.`);
      navegar(`/compras/${r.compra.id}`);
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma" href="#/compras" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Nueva compra</h1>
  </div>
</div>

<form class="pila" onsubmit={guardar}>
  <div class="tarjeta pila">
    <h2>Factura</h2>
    <div class="rejilla">
      <div class="campo">
        <span>Proveedor *</span>
        <div class="fila sin-salto">
          <select bind:value={proveedorId} aria-label="Proveedor">
            <option value="">Elige…</option>
            {#each compras.proveedores.filter((p) => p.activo) as p (p.id)}
              <option value={p.id}>{p.nombre}</option>
            {/each}
          </select>
          <button type="button" class="btn" onclick={() => { nuevoProveedor = { nombre: '', rif: '', telefono: '' }; proveedorAbierto = true; }}>
            <Icono nombre="mas" /> Nuevo
          </button>
        </div>
      </div>
      <label class="campo">
        <span>Fecha de la factura</span>
        <input type="date" bind:value={fecha} max={app.hoy} />
      </label>
      <label class="campo">
        <span>N° de factura</span>
        <input bind:value={factura} maxlength="40" placeholder="Opcional" />
      </label>
    </div>
    <div class="campo">
      <span>La factura viene en</span>
      <div class="segmentado" role="radiogroup" aria-label="Moneda de la factura">
        <label><input type="radio" bind:group={moneda} value="USD" /> Dólares</label>
        <label><input type="radio" bind:group={moneda} value="VES" /> Bolívares (deuda fija en Bs)</label>
      </div>
    </div>
  </div>

  <div class="tarjeta pila">
    <h2>Productos</h2>
    <SelectorProducto bind:seleccionado={elegido} />
    {#if lineas.length === 0}
      <p class="ayuda">Busca y elige cada producto que llegó.</p>
    {:else}
      <div class="lineas">
        {#each calculadas as c, i (c.l.clave)}
          {@const presentaciones = presentacionesDe(c.l.producto)}
          {@const unidadLinea = c.l.presentacionId ? 'unidad' : c.l.producto.unidad}
          <div class="linea">
            <div class="desc">
              <strong>{c.l.producto.nombre}</strong>
              <span class="ayuda">
                Stock {formatearCantidad(c.l.producto.stock, c.l.producto.unidad)} · costo actual {formatearCosto(c.l.producto.costoPromedio)}
                {c.l.producto.unidad === 'kg' ? 'por kg' : 'c/u'}
              </span>
            </div>
            <label class="campo">
              <span>Viene en</span>
              <select bind:value={c.l.presentacionId}>
                <option value="">{c.l.producto.unidad === 'kg' ? 'Kilos' : 'Unidades'}</option>
                {#each presentaciones as p (p.id)}
                  <option value={p.id}>{p.nombre} ({formatearCantidad(p.factor, c.l.producto.unidad)})</option>
                {/each}
              </select>
            </label>
            <label class="campo">
              <span>Cantidad</span>
              <input bind:value={c.l.cantidad} inputmode="decimal" class="num" placeholder="0" aria-invalid={c.l.cantidad !== '' && !c.cantidad} />
            </label>
            <label class="campo">
              <span>Costo c/u ({moneda === 'USD' ? '$' : 'Bs'})</span>
              <input
                bind:value={c.l.costo}
                inputmode="decimal"
                class="num"
                placeholder={formatearParaEditar(costoActual(c.l), ESCALA.centavos)}
                aria-invalid={c.l.costo !== '' && c.costo === null}
              />
            </label>
            <div class="subtotal num">
              <strong>{c.subtotal !== null ? formatearMonto(c.subtotal, moneda) : '—'}</strong>
              {#if c.nuevoCosto !== null}
                <span class="ayuda" class:sube={c.nuevoCosto > c.l.producto.costoPromedio} class:baja={c.nuevoCosto < c.l.producto.costoPromedio}>
                  {formatearCosto(c.nuevoCosto)} {c.l.producto.unidad === 'kg' && !c.l.presentacionId ? '/kg' : 'c/u'}
                </span>
              {/if}
            </div>
            <button type="button" class="btn btn-fantasma btn-chico" aria-label="Quitar" onclick={() => lineas.splice(i, 1)}>
              <Icono nombre="basura" tamano={18} />
            </button>
            {#if unidadLinea === 'unidad' && c.cantidad !== null && c.cantidad % 1000 !== 0}
              <span class="chip chip-agotado error-linea">Se compra por unidades enteras</span>
            {/if}
          </div>
        {/each}
      </div>
      <div class="total">
        <span class="suave">Total de la factura</span>
        <strong class="num">{formatearMonto(total, moneda)}</strong>
      </div>
    {/if}
  </div>

  <div class="tarjeta pila">
    <h2>Pago</h2>
    <div class="segmentado" role="radiogroup" aria-label="Condición de pago">
      <label><input type="radio" bind:group={condicion} value="credito" /> A crédito</label>
      <label><input type="radio" bind:group={condicion} value="parcial" /> Pagué una parte</label>
      <label><input type="radio" bind:group={condicion} value="pagada" /> Pagué todo</label>
    </div>

    {#if condicion !== 'credito'}
      <div class="rejilla">
        <label class="campo">
          <span>Pagado con</span>
          <select bind:value={metodo} onchange={cambiarMetodo}>
            {#each ORDEN_METODOS as m}<option value={m}>{METODOS_PAGO[m].nombre}</option>{/each}
          </select>
        </label>
        {#if condicion === 'parcial'}
          <label class="campo">
            <span>Monto pagado ({monedaPago === 'USD' ? '$' : 'Bs'})</span>
            <input bind:value={montoParcial} inputmode="decimal" class="num" aria-invalid={montoParcial !== '' && !montoPago} />
          </label>
        {:else}
          <div class="campo">
            <span>Monto</span>
            <strong class="num monto-total">{montoPago !== null ? formatearMonto(montoPago, monedaPago) : '—'}</strong>
          </div>
        {/if}
        {#if METODOS_PAGO[metodo].referencia}
          <label class="campo">
            <span>Referencia</span>
            <input bind:value={referencia} inputmode="numeric" maxlength="20" />
          </label>
        {/if}
      </div>
      <label class="casilla">
        <input type="checkbox" bind:checked={desdeCaja} />
        Salió de la gaveta de la caja {#if !caja.sesion}<span class="ayuda">(la caja está cerrada)</span>{/if}
      </label>
    {/if}

    {#if condicion !== 'pagada'}
      <label class="campo vence">
        <span>Fecha límite para pagar</span>
        <input type="date" bind:value={vencimiento} min={fecha} />
      </label>
    {/if}
  </div>

  <label class="campo">
    <span>Notas</span>
    <input bind:value={notas} maxlength="200" />
  </label>

  <div class="acciones">
    <a class="btn" href="#/compras">Cancelar</a>
    <button class="btn btn-primario btn-grande" disabled={guardando || !lineasValidas || !proveedorId}>
      {guardando ? 'Guardando…' : 'Registrar compra'}
    </button>
  </div>
</form>

<Modal bind:abierto={proveedorAbierto} titulo="Nuevo proveedor">
  <label class="campo">
    <span>Nombre *</span>
    <input bind:value={nuevoProveedor.nombre} maxlength="80" placeholder="Distribuidora El Sol" />
  </label>
  <div class="rejilla">
    <label class="campo">
      <span>RIF</span>
      <input bind:value={nuevoProveedor.rif} placeholder="J-12345678-9" />
    </label>
    <label class="campo">
      <span>Teléfono</span>
      <input bind:value={nuevoProveedor.telefono} inputmode="tel" />
    </label>
  </div>
  {#snippet acciones()}
    <button class="btn" onclick={() => (proveedorAbierto = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={!nuevoProveedor.nombre.trim()} onclick={crearProveedor}>Crear</button>
  {/snippet}
</Modal>

<style>
  .sin-salto {
    flex-wrap: nowrap;
  }

  .sin-salto select {
    flex: 1;
  }

  .lineas {
    display: flex;
    flex-direction: column;
  }

  .linea {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) 1fr 0.7fr 0.8fr 0.9fr auto;
    gap: 0.6rem;
    align-items: end;
    padding: 0.75rem 0;
    border-bottom: 1px dashed var(--borde);
  }

  .desc {
    display: flex;
    flex-direction: column;
    align-self: center;
    min-width: 0;
  }

  .subtotal {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding-bottom: 0.4rem;
  }

  .sube {
    color: var(--peligro);
  }

  .baja {
    color: var(--exito);
  }

  .error-linea {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .total {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 1rem;
  }

  .total strong {
    font-size: 1.6rem;
    color: var(--primario);
  }

  .monto-total {
    font-size: 1.3rem;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .vence {
    max-width: 260px;
  }

  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  @media (max-width: 900px) {
    .linea {
      grid-template-columns: 1fr 1fr;
    }

    .desc {
      grid-column: 1 / -1;
    }
  }
</style>
