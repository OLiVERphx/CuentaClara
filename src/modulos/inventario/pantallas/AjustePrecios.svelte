<script lang="ts">
  import { app, puede, redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import { ESCALA, formatearBs, formatearCosto, formatearPorcentaje, formatearUsd, margenSobreVenta, parsearDecimal } from '../../../core/dinero/dinero';
  import { formatearMonto } from '../../../core/pagos';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { inventario } from '../almacen.svelte';
  import { nuevoPrecio, precioEnBs, type ReglaPrecio } from '../precios';
  import { ajustarPrecios } from '../servicio';

  let categoriaId = $state('');
  let moneda = $state<'USD' | 'VES'>('USD');
  let tipo = $state<ReglaPrecio['tipo']>('porcentaje');
  let valorTexto = $state('');
  let pasoUsd = $state(1);
  let excluidos = $state(new Set<string>());
  let confirmar = $state(false);
  let aplicando = $state(false);

  const verCostos = puede('productos.ver_costos');
  const tasa = $derived(tasaDelDia());
  const valor = $derived(parsearDecimal(valorTexto, ESCALA.centesimas, { permitirNegativo: tipo === 'porcentaje' }));
  // En Bs fijo se redondea al paso de precios del negocio; en $, al elegido.
  const paso = $derived(moneda === 'USD' ? pasoUsd : redondeoBs().paso);

  const filas = $derived.by(() => {
    void inventario.version;
    const regla: ReglaPrecio | null = valor === null ? null : { tipo, centesimas: valor };
    return inventario.indice
      .todos()
      .filter((p) => p.activo && p.monedaPrecio === moneda && (!categoriaId || p.categoriaId === categoriaId))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((p) => {
        const nuevo = regla ? nuevoPrecio(p, regla, paso) : null;
        return {
          p,
          nuevo,
          margenActual: p.monedaPrecio === 'USD' && p.costoPromedio > 0 ? margenSobreVenta(p.precio, p.costoPromedio) : null,
          margenNuevo: nuevo !== null && p.monedaPrecio === 'USD' && p.costoPromedio > 0 ? margenSobreVenta(nuevo, p.costoPromedio) : null,
        };
      });
  });

  const cambios = $derived(filas.filter((f) => f.nuevo !== null && f.nuevo !== f.p.precio && !excluidos.has(f.p.id)));

  function alternar(id: string) {
    const s = new Set(excluidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    excluidos = s;
  }

  async function aplicar() {
    aplicando = true;
    try {
      const motivo = tipo === 'porcentaje' ? `Ajuste de ${formatearPorcentaje(valor ?? 0)}` : `Margen de ${formatearPorcentaje(valor ?? 0)} sobre costo`;
      const n = await ajustarPrecios(
        cambios.map((c) => ({ productoId: c.p.id, precio: c.nuevo! })),
        motivo,
      );
      avisar(`Se actualizaron ${n} precios.`);
      confirmar = false;
      navegar('/productos');
    } catch (e) {
      avisarError(e);
    } finally {
      aplicando = false;
    }
  }

  function mostrar(precio: number): string {
    if (moneda === 'VES') return formatearBs(precio);
    return tasa !== null ? `${formatearUsd(precio)} · ${formatearBs(precioEnBs(precio, 'USD', tasa, redondeoBs()))}` : formatearUsd(precio);
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma" href="#/productos" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Ajuste de precios</h1>
  </div>
</div>

<div class="tarjeta pila">
  <div class="rejilla">
    <label class="campo">
      <span>Categoría</span>
      <select bind:value={categoriaId}>
        <option value="">Todas</option>
        {#each inventario.categorias as c (c.id)}<option value={c.id}>{c.nombre}</option>{/each}
      </select>
    </label>
    <div class="campo">
      <span>Productos con precio en</span>
      <div class="segmentado" role="radiogroup" aria-label="Moneda del precio">
        <label><input type="radio" bind:group={moneda} value="USD" /> Dólares</label>
        <label><input type="radio" bind:group={moneda} value="VES" /> Bs fijo</label>
      </div>
    </div>
  </div>
  <div class="rejilla">
    <div class="campo">
      <span>Qué hacer</span>
      <div class="segmentado" role="radiogroup" aria-label="Regla">
        <label><input type="radio" bind:group={tipo} value="porcentaje" /> Subir o bajar %</label>
        {#if moneda === 'USD' && verCostos}<label><input type="radio" bind:group={tipo} value="margen" /> Margen sobre costo</label>{/if}
      </div>
    </div>
    <label class="campo">
      <span>{tipo === 'porcentaje' ? 'Porcentaje (negativo para bajar)' : 'Margen deseado (%)'}</span>
      <input bind:value={valorTexto} inputmode="decimal" class="num" placeholder={tipo === 'porcentaje' ? '10' : '25'} aria-invalid={valorTexto !== '' && valor === null} />
    </label>
    {#if moneda === 'USD'}
      <label class="campo">
        <span>Redondear hacia arriba</span>
        <select bind:value={pasoUsd}>
          <option value={1}>Al centavo</option>
          <option value={5}>A $0,05</option>
          <option value={10}>A $0,10</option>
          <option value={25}>A $0,25</option>
        </select>
      </label>
    {/if}
  </div>
  {#if tipo === 'margen'}
    <p class="ayuda">Precio = costo ÷ (1 − margen). Un margen de 25 % sobre un costo de $1,00 da $1,34. Los productos sin costo no cambian.</p>
  {/if}
</div>

<div class="fila-separada barra-accion">
  <span class="ayuda">{cambios.length} de {filas.length} productos cambiarán. Desmarca los que no quieras tocar.</span>
  <button class="btn btn-primario" disabled={cambios.length === 0} onclick={() => (confirmar = true)}>Aplicar a {cambios.length}</button>
</div>

{#if filas.length === 0}
  <p class="vacio">No hay productos activos con ese filtro.</p>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Producto</th>
          {#if verCostos && moneda === 'USD'}<th class="derecha ocultable">Costo</th>{/if}
          <th class="derecha">Actual</th>
          <th class="derecha">Nuevo</th>
          {#if verCostos && moneda === 'USD'}<th class="derecha ocultable">Margen</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each filas as f (f.p.id)}
          {@const cambia = f.nuevo !== null && f.nuevo !== f.p.precio}
          <tr class:sin-cambio={!cambia || excluidos.has(f.p.id)}>
            <td><input type="checkbox" checked={!excluidos.has(f.p.id)} disabled={!cambia} onchange={() => alternar(f.p.id)} aria-label="Incluir {f.p.nombre}" /></td>
            <td>{f.p.nombre}</td>
            {#if verCostos && moneda === 'USD'}<td class="derecha num ocultable suave">{f.p.costoPromedio ? formatearCosto(f.p.costoPromedio) : '—'}</td>{/if}
            <td class="derecha num">{mostrar(f.p.precio)}</td>
            <td class="derecha num"><strong>{f.nuevo !== null ? mostrar(f.nuevo) : '—'}</strong></td>
            {#if verCostos && moneda === 'USD'}
              <td class="derecha num ocultable">
                {f.margenActual !== null ? formatearPorcentaje(f.margenActual) : '—'}{#if cambia && f.margenNuevo !== null} → <strong>{formatearPorcentaje(f.margenNuevo)}</strong>{/if}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:abierto={confirmar} titulo="¿Aplicar el ajuste?">
  <p>
    Cambiarán <strong>{cambios.length}</strong> precios
    ({tipo === 'porcentaje' ? formatearPorcentaje(valor ?? 0) : `margen de ${formatearPorcentaje(valor ?? 0)}`}). Las presentaciones con precio
    propio se ajustan en la misma proporción. Queda registrado en la auditoría.
  </p>
  {#snippet acciones()}
    <button class="btn" onclick={() => (confirmar = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={aplicando} onclick={aplicar}>Aplicar</button>
  {/snippet}
</Modal>

<style>
  .barra-accion {
    margin: 1rem 0 0.5rem;
  }

  .sin-cambio td {
    opacity: 0.55;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
