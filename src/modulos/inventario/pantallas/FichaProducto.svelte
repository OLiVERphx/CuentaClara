<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { puede, redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { navegar } from '../../../app/router.svelte';
  import {
    ESCALA,
    formatearBs,
    formatearCantidad,
    formatearCosto,
    formatearParaEditar,
    formatearPorcentaje,
    formatearUsd,
    margenSobreVenta,
    multiplicarCantidad,
    parsearDecimal,
  } from '../../../core/dinero/dinero';
  import { ErrorNegocio } from '../../../core/errores';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import { enUsd, precioEnBs } from '../precios';
  import { actualizarProducto, crearCategoria, crearProducto, listarMovimientos, type DatosPresentacion } from '../servicio';
  import { TIPOS_MOVIMIENTO, type MonedaPrecio, type MovimientoInventario, type Producto, type Unidad } from '../tipos';

  let { params }: PropsPantalla = $props();

  // La pantalla se vuelve a montar al cambiar de ruta, así que el id es fijo.
  const id = untrack(() => params.id);
  const esNuevo = !id;
  const existente = id ? inventario.indice.obtener(id) : null;
  const editable = puede('productos.editar');
  const verCostos = puede('productos.ver_costos');
  const tasa = $derived(tasaDelDia());

  interface FormPresentacion {
    id?: string;
    nombre: string;
    factor: string;
    precio: string;
    codigoBarras: string;
    paraVenta: boolean;
    paraCompra: boolean;
  }

  function aFormulario(p: Producto | undefined) {
    return {
      nombre: p?.nombre ?? '',
      codigo: p?.codigo ?? '',
      codigoBarras: p?.codigoBarras ?? '',
      categoriaId: p?.categoriaId ?? '',
      unidad: (p?.unidad ?? 'unidad') as Unidad,
      moneda: (p?.monedaPrecio ?? 'USD') as MonedaPrecio,
      precio: p ? formatearParaEditar(p.precio, ESCALA.centavos) : '',
      costo: p ? formatearParaEditar(p.costoPromedio, ESCALA.diezmilesimas) : '',
      stockMinimo: p ? formatearParaEditar(p.stockMinimo, ESCALA.milesimas) : '',
      stockInicial: '',
      activo: p?.activo ?? true,
    };
  }

  let f = $state(aFormulario(existente?.producto));
  let presentaciones = $state<FormPresentacion[]>(
    (existente?.presentaciones ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      factor: formatearParaEditar(p.factor, ESCALA.milesimas),
      precio: p.precio === null ? '' : formatearParaEditar(p.precio, ESCALA.centavos),
      codigoBarras: p.codigoBarras ?? '',
      paraVenta: p.paraVenta,
      paraCompra: p.paraCompra,
    })),
  );
  let guardando = $state(false);
  let nuevaCategoria = $state<string | null>(null);
  let movimientos = $state<MovimientoInventario[]>([]);

  const producto = $derived.by(() => {
    void inventario.version;
    return id ? (inventario.indice.obtener(id)?.producto ?? null) : null;
  });

  onMount(async () => {
    if (id) movimientos = await listarMovimientos(id, 50);
  });

  // Vista previa en vivo
  const precio = $derived(parsearDecimal(f.precio, ESCALA.centavos));
  const costo = $derived(f.costo.trim() === '' ? 0 : parsearDecimal(f.costo, ESCALA.diezmilesimas));
  const precioUsd = $derived(precio !== null && tasa !== null ? enUsd(precio, f.moneda, tasa) : f.moneda === 'USD' ? precio : null);
  const margen = $derived(precioUsd !== null && costo !== null && costo > 0 ? margenSobreVenta(precioUsd, costo) : null);
  const etiquetaUnidad = $derived(f.unidad === 'kg' ? 'kg' : 'unidades');

  function agregarPresentacion() {
    presentaciones.push({ nombre: '', factor: '', precio: '', codigoBarras: '', paraVenta: true, paraCompra: true });
  }

  async function confirmarCategoria() {
    if (!nuevaCategoria?.trim()) {
      nuevaCategoria = null;
      return;
    }
    try {
      const c = await crearCategoria(nuevaCategoria);
      f.categoriaId = c.id;
      nuevaCategoria = null;
    } catch (e) {
      avisarError(e);
    }
  }

  function leerCantidad(texto: string, campo: string, obligatorio = false): number {
    if (!texto.trim() && !obligatorio) return 0;
    const n = parsearDecimal(texto, ESCALA.milesimas);
    if (n === null) throw new ErrorNegocio(`${campo}: cantidad no válida.`);
    return n;
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (precio === null) throw new ErrorNegocio('Escribe un precio válido.');
      if (costo === null) throw new ErrorNegocio('El costo no es válido.');
      const datos = {
        codigo: f.codigo,
        codigoBarras: f.codigoBarras,
        nombre: f.nombre,
        categoriaId: f.categoriaId || null,
        unidad: f.unidad,
        monedaPrecio: f.moneda,
        precio,
        costoPromedio: costo,
        stockMinimo: leerCantidad(f.stockMinimo, 'Stock mínimo'),
        activo: f.activo,
      };
      const pres: DatosPresentacion[] = presentaciones.map((p) => {
        const precioPres = p.precio.trim() ? parsearDecimal(p.precio, ESCALA.centavos) : null;
        if (p.precio.trim() && precioPres === null) throw new ErrorNegocio(`El precio de «${p.nombre}» no es válido.`);
        return {
          id: p.id,
          nombre: p.nombre,
          factor: leerCantidad(p.factor, `«${p.nombre || 'Presentación'}»`, true),
          precio: precioPres,
          codigoBarras: p.codigoBarras,
          paraVenta: p.paraVenta,
          paraCompra: p.paraCompra,
        };
      });
      guardando = true;
      if (esNuevo) {
        const nuevo = await crearProducto(datos, pres, leerCantidad(f.stockInicial, 'Stock inicial'));
        avisar(`Producto «${nuevo.nombre}» creado con el código ${nuevo.codigo}.`);
        navegar(`/productos/${nuevo.id}`);
      } else if (id) {
        await actualizarProducto(id, datos, pres);
        avisar('Cambios guardados.');
        navegar('/productos');
      }
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }
</script>

{#if !esNuevo && !existente}
  <div class="vacio">
    <p>Este producto no existe o fue eliminado.</p>
    <p><a href="#/productos">Volver a productos</a></p>
  </div>
{:else}
  <div class="encabezado-pagina">
    <div class="fila">
      <a class="btn btn-fantasma" href="#/productos" aria-label="Volver"><Icono nombre="atras" /></a>
      <h1>{esNuevo ? 'Nuevo producto' : f.nombre || 'Producto'}</h1>
      {#if producto && !producto.activo}<span class="chip">Inactivo</span>{/if}
    </div>
    {#if producto && puede('inventario.ajustar')}
      <a class="btn" href="#/inventario?producto={producto.id}"><Icono nombre="inventario" /> Ajustar stock</a>
    {/if}
  </div>

  <form class="ficha" onsubmit={guardar}>
    <fieldset class="pila" disabled={!editable}>
      <div class="tarjeta pila">
        <h2>Datos</h2>
        <label class="campo">
          <span>Nombre *</span>
          <input bind:value={f.nombre} maxlength="120" placeholder="Harina P.A.N. 1 kg" />
        </label>
        <div class="rejilla">
          <label class="campo">
            <span>Código interno</span>
            <input bind:value={f.codigo} maxlength="30" placeholder="Automático" class="mono" />
          </label>
          <label class="campo">
            <span>Código de barras</span>
            <input bind:value={f.codigoBarras} inputmode="numeric" placeholder="Opcional" class="mono" />
          </label>
        </div>
        <div class="campo">
          <span>Categoría</span>
          {#if nuevaCategoria === null}
            <div class="fila sin-salto">
              <select bind:value={f.categoriaId} aria-label="Categoría">
                <option value="">Sin categoría</option>
                {#each inventario.categorias as c (c.id)}
                  <option value={c.id}>{c.nombre}</option>
                {/each}
              </select>
              <button type="button" class="btn" onclick={() => (nuevaCategoria = '')}><Icono nombre="mas" /> Nueva</button>
            </div>
          {:else}
            <div class="fila sin-salto">
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={nuevaCategoria} placeholder="Nombre de la categoría" aria-label="Nueva categoría" autofocus
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmarCategoria(); } }} />
              <button type="button" class="btn btn-primario" onclick={confirmarCategoria}>Crear</button>
              <button type="button" class="btn btn-fantasma" onclick={() => (nuevaCategoria = null)} aria-label="Cancelar"><Icono nombre="cerrar" /></button>
            </div>
          {/if}
        </div>
        <div class="rejilla">
          <div class="campo">
            <span>Se vende por</span>
            <div class="segmentado" role="radiogroup" aria-label="Unidad">
              <label><input type="radio" bind:group={f.unidad} value="unidad" /> Unidad</label>
              <label><input type="radio" bind:group={f.unidad} value="kg" /> Kilo</label>
            </div>
          </div>
          {#if !esNuevo}
            <label class="casilla">
              <input type="checkbox" bind:checked={f.activo} />
              Activo (aparece en búsquedas)
            </label>
          {/if}
        </div>
      </div>

      <div class="tarjeta pila">
        <h2>Precio</h2>
        <div class="campo">
          <span>Moneda del precio</span>
          <div class="segmentado" role="radiogroup" aria-label="Moneda del precio">
            <label><input type="radio" bind:group={f.moneda} value="USD" /> Dólares (se convierte con la tasa)</label>
            <label><input type="radio" bind:group={f.moneda} value="VES" /> Bs fijo</label>
          </div>
        </div>
        <div class="rejilla">
          <label class="campo">
            <span>Precio por {f.unidad === 'kg' ? 'kg' : 'unidad'} en {f.moneda === 'USD' ? '$' : 'Bs'} *</span>
            <input bind:value={f.precio} inputmode="decimal" class="num" placeholder={f.moneda === 'USD' ? '1,25' : '1.500,00'} aria-invalid={f.precio !== '' && precio === null} />
          </label>
          {#if verCostos}
            <label class="campo">
              <span>Costo por {f.unidad === 'kg' ? 'kg' : 'unidad'} en $</span>
              <input bind:value={f.costo} inputmode="decimal" class="num" placeholder="0,95" aria-invalid={costo === null} />
            </label>
          {/if}
        </div>
        {#if precio !== null}
          <div class="vista-previa">
            {#if tasa !== null}
              <span>Hoy: <strong class="num">{formatearBs(precioEnBs(precio, f.moneda, tasa, redondeoBs()))}</strong> · <span class="num">{f.moneda === 'VES' ? '≈ ' : ''}{formatearUsd(enUsd(precio, f.moneda, tasa))}</span></span>
            {:else}
              <span class="suave">Sin tasa vigente: no se puede mostrar la conversión.</span>
            {/if}
            {#if verCostos && margen !== null}
              <span class="chip" class:chip-normal={margen > 0} class:chip-agotado={margen <= 0}>Margen {formatearPorcentaje(margen)}</span>
            {/if}
          </div>
        {/if}
        {#if verCostos && !esNuevo}
          <p class="ayuda">El costo se recalcula solo (promedio ponderado) con cada entrada que indique costo. Edítalo a mano solo para corregirlo.</p>
        {/if}
      </div>

      <div class="tarjeta pila">
        <h2>Stock</h2>
        <div class="rejilla">
          {#if esNuevo}
            <label class="campo">
              <span>Stock inicial ({etiquetaUnidad})</span>
              <input bind:value={f.stockInicial} inputmode="decimal" class="num" placeholder="0" />
            </label>
          {:else if producto}
            <div class="campo">
              <span>Stock actual</span>
              <strong class="num stock-actual">{formatearCantidad(producto.stock, producto.unidad)}</strong>
            </div>
          {/if}
          <label class="campo">
            <span>Stock mínimo ({etiquetaUnidad})</span>
            <input bind:value={f.stockMinimo} inputmode="decimal" class="num" placeholder="0" />
          </label>
        </div>
        <p class="ayuda">
          {esNuevo ? 'Después de crearlo, el stock solo cambia con ajustes, compras y ventas, y cada cambio queda registrado.' : 'Al bajar del mínimo, el producto aparece como «stock bajo».'}
        </p>
      </div>

      <div class="tarjeta pila">
        <div class="fila-separada">
          <h2>Presentaciones</h2>
          <button type="button" class="btn btn-chico" onclick={agregarPresentacion}><Icono nombre="mas" tamano={16} /> Agregar</button>
        </div>
        <p class="ayuda">Formas de vender o comprar este producto: bulto x24, caja x20, medio kilo… El stock se sigue llevando en {etiquetaUnidad}.</p>
        {#each presentaciones as p, i (i)}
          {@const factor = parsearDecimal(p.factor, ESCALA.milesimas)}
          <div class="presentacion">
            <label class="campo">
              <span>Nombre</span>
              <input bind:value={p.nombre} placeholder="Bulto x24" />
            </label>
            <label class="campo">
              <span>Contiene ({etiquetaUnidad})</span>
              <input bind:value={p.factor} inputmode="decimal" class="num" placeholder="24" />
            </label>
            <label class="campo">
              <span>Precio propio ({f.moneda === 'USD' ? '$' : 'Bs'})</span>
              <input bind:value={p.precio} inputmode="decimal" class="num"
                placeholder={precio !== null && factor ? formatearParaEditar(multiplicarCantidad(precio, factor), 2) : 'Calculado'} />
            </label>
            <label class="campo">
              <span>Código de barras</span>
              <input bind:value={p.codigoBarras} class="mono" placeholder="Opcional" />
            </label>
            <div class="opciones">
              <label class="casilla"><input type="checkbox" bind:checked={p.paraVenta} /> Venta</label>
              <label class="casilla"><input type="checkbox" bind:checked={p.paraCompra} /> Compra</label>
              <button type="button" class="btn btn-fantasma btn-chico" aria-label="Quitar presentación" onclick={() => presentaciones.splice(i, 1)}>
                <Icono nombre="basura" tamano={18} />
              </button>
            </div>
          </div>
        {:else}
          <p class="suave">Sin presentaciones: se vende solo por {f.unidad === 'kg' ? 'kilo' : 'unidad'}.</p>
        {/each}
        {#if presentaciones.length > 0}
          <p class="ayuda">Si dejas el precio propio vacío, se calcula como cantidad × precio base (por ejemplo, un descuento por bulto va como precio propio).</p>
        {/if}
      </div>
    </fieldset>

    {#if editable}
      <div class="acciones">
        <a class="btn" href="#/productos">Cancelar</a>
        <button class="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}</button>
      </div>
    {/if}
  </form>

  {#if !esNuevo}
    <section class="pila-chica kardex">
      <h2>Movimientos de inventario</h2>
      {#if movimientos.length === 0}
        <p class="vacio">Sin movimientos.</p>
      {:else}
        <div class="tabla-contenedor">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th class="derecha">Cantidad</th>
                <th class="derecha">Stock</th>
                {#if verCostos}<th class="derecha">Costo</th>{/if}
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {#each movimientos as m (m.id)}
                <tr>
                  <td class="suave">{formatearFechaHora(m.creadoEn)}</td>
                  <td>{TIPOS_MOVIMIENTO[m.tipo].nombre}</td>
                  <td class="derecha num" class:positivo={m.cantidad > 0} class:negativo={m.cantidad < 0}>
                    {m.cantidad > 0 ? '+' : ''}{formatearCantidad(m.cantidad)}
                  </td>
                  <td class="derecha num">{formatearCantidad(m.stockResultante)}</td>
                  {#if verCostos}<td class="derecha num">{formatearCosto(m.costoUnitario)}</td>{/if}
                  <td class="suave">{m.motivo}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .ficha {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .sin-salto {
    flex-wrap: nowrap;
  }

  .sin-salto select,
  .sin-salto input {
    flex: 1;
  }

  .vista-previa {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radio-chico);
    background: var(--superficie-2);
  }

  .stock-actual {
    font-size: 1.4rem;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .presentacion {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr 0.9fr 1fr auto;
    gap: 0.6rem;
    align-items: end;
    padding-bottom: 0.75rem;
    border-bottom: 1px dashed var(--borde);
  }

  .opciones {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .acciones {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 0;
    background: linear-gradient(transparent, var(--fondo) 30%);
  }

  .kardex {
    margin-top: 1.5rem;
  }

  .positivo {
    color: var(--exito);
  }

  .negativo {
    color: var(--peligro);
  }

  @media (max-width: 900px) {
    .presentacion {
      grid-template-columns: 1fr 1fr;
    }

    .opciones {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 760px) {
    .acciones {
      bottom: calc(72px + env(safe-area-inset-bottom));
    }
  }
</style>
