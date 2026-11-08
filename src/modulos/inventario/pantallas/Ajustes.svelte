<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { puede } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { ESCALA, formatearCantidad, formatearCosto, parsearDecimal } from '../../../core/dinero/dinero';
  import { ErrorNegocio } from '../../../core/errores';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import { listarMovimientosRecientes, registrarAjuste, registrarConteo, type TipoAjuste } from '../servicio';
  import { TIPOS_MOVIMIENTO, type MovimientoInventario, type Producto } from '../tipos';
  import { contarPorReponer } from '../reposicion';
  import SelectorProducto from './SelectorProducto.svelte';

  let { consulta }: PropsPantalla = $props();

  type Operacion = TipoAjuste | 'conteo';

  const OPERACIONES: { valor: Operacion; nombre: string; ayuda: string }[] = [
    { valor: 'ajuste_positivo', nombre: 'Entrada de mercancía', ayuda: 'Llegó mercancía. Si indicas el costo, se recalcula el costo promedio.' },
    { valor: 'conteo', nombre: 'Conteo físico', ayuda: 'Escribe lo que contaste; el sistema registra solo la diferencia.' },
    { valor: 'merma', nombre: 'Merma (dañado / vencido)', ayuda: 'Producto que se perdió y no se vendió.' },
    { valor: 'consumo_propio', nombre: 'Consumo propio', ayuda: 'Lo que se tomó para la casa.' },
    { valor: 'ajuste_negativo', nombre: 'Salida / corrección (−)', ayuda: 'Otra salida que no es venta.' },
    { valor: 'inventario_inicial', nombre: 'Inventario inicial', ayuda: 'Primera carga del stock de un producto existente.' },
  ];

  const idInicial = untrack(() => consulta.get('producto'));
  let producto = $state<Producto | null>(idInicial ? (inventario.indice.obtener(idInicial)?.producto ?? null) : null);
  let operacion = $state<Operacion>('ajuste_positivo');
  let cantidadTexto = $state('');
  let costoTexto = $state('');
  let motivo = $state('');
  let guardando = $state(false);
  let recientes = $state<MovimientoInventario[]>([]);

  const info = $derived(OPERACIONES.find((o) => o.valor === operacion)!);
  const esEntrada = $derived(operacion === 'ajuste_positivo' || operacion === 'inventario_inicial');
  const cantidad = $derived(cantidadTexto.trim() ? parsearDecimal(cantidadTexto, ESCALA.milesimas) : null);

  // El producto seleccionado se mantiene al día cuando cambia el stock.
  const actual = $derived.by(() => {
    void inventario.version;
    return producto ? (inventario.indice.obtener(producto.id)?.producto ?? producto) : null;
  });

  const resultado = $derived.by(() => {
    if (!actual || cantidad === null) return null;
    if (operacion === 'conteo') return cantidad;
    return actual.stock + TIPOS_MOVIMIENTO[operacion].signo * cantidad;
  });

  async function cargarRecientes() {
    recientes = await listarMovimientosRecientes(30);
  }

  onMount(cargarRecientes);

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (!actual) return;
    guardando = true;
    try {
      if (cantidad === null) throw new ErrorNegocio('Escribe una cantidad válida.');
      let costo: number | null = null;
      if (esEntrada && costoTexto.trim()) {
        costo = parsearDecimal(costoTexto, ESCALA.diezmilesimas);
        if (costo === null) throw new ErrorNegocio('El costo no es válido.');
      }
      const r =
        operacion === 'conteo'
          ? await registrarConteo(actual.id, cantidad, motivo)
          : await registrarAjuste({ productoId: actual.id, tipo: operacion, cantidad, costoUnitario: costo, motivo });
      avisar(`Listo. Stock de «${r.nombre}»: ${formatearCantidad(r.stock, r.unidad)}.`);
      cantidadTexto = costoTexto = motivo = '';
      await cargarRecientes();
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }

  const porReponer = $derived.by(() => {
    void inventario.version;
    return contarPorReponer(inventario.indice.todos());
  });

  function nombreProducto(id: string): string {
    return inventario.indice.obtener(id)?.producto.nombre ?? '—';
  }
</script>

<div class="encabezado-pagina">
  <h1>Ajustes de inventario</h1>
  <div class="fila">
    <a class="btn btn-primario" href="#/inventario/conteo"><Icono nombre="check" /> Conteo rápido</a>
    <a class="btn" href="#/inventario/reponer">
      <Icono nombre="alerta" /> Por reponer{#if porReponer > 0} <span class="chip chip-bajo num">{porReponer}</span>{/if}
    </a>
    {#if puede('productos.editar')}
      <a class="btn" href="#/inventario/importar"><Icono nombre="subir" /> Importar productos</a>
    {/if}
  </div>
</div>

<div class="dos-columnas">
  <form class="tarjeta pila" onsubmit={guardar}>
    <div class="campo">
      <span>Producto</span>
      <SelectorProducto bind:seleccionado={producto} />
    </div>

    <label class="campo">
      <span>Operación</span>
      <select bind:value={operacion}>
        {#each OPERACIONES as o}
          <option value={o.valor}>{o.nombre}</option>
        {/each}
      </select>
    </label>
    <p class="ayuda">{info.ayuda}</p>

    <div class="rejilla">
      <label class="campo">
        <span>{operacion === 'conteo' ? 'Cantidad contada' : 'Cantidad'} {actual ? `(${actual.unidad === 'kg' ? 'kg' : 'unidades'})` : ''}</span>
        <input bind:value={cantidadTexto} inputmode="decimal" class="num" aria-invalid={cantidadTexto !== '' && cantidad === null} />
      </label>
      {#if esEntrada && puede('productos.ver_costos')}
        <label class="campo">
          <span>Costo unitario en $ (opcional)</span>
          <input bind:value={costoTexto} inputmode="decimal" class="num" placeholder={actual ? formatearCosto(actual.costoPromedio) : ''} />
        </label>
      {/if}
    </div>

    <label class="campo">
      <span>Motivo {operacion === 'inventario_inicial' || operacion === 'conteo' ? '(opcional)' : '*'}</span>
      <input bind:value={motivo} maxlength="120" placeholder={operacion === 'merma' ? 'Paquetes rotos' : ''} />
    </label>

    {#if actual && resultado !== null}
      <div class="alerta" class:alerta-info={resultado >= 0} class:alerta-peligro={resultado < 0}>
        Stock: <strong class="num">{formatearCantidad(actual.stock, actual.unidad)}</strong> → <strong class="num">{formatearCantidad(resultado, actual.unidad)}</strong>
      </div>
    {/if}

    <div>
      <button class="btn btn-primario" disabled={guardando || !actual || cantidad === null}>{guardando ? 'Guardando…' : 'Registrar'}</button>
    </div>
  </form>

  <section class="pila-chica">
    <h2>Últimos movimientos</h2>
    {#if recientes.length === 0}
      <p class="vacio">Todavía no hay movimientos.</p>
    {:else}
      <div class="tabla-contenedor">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="derecha">Cant.</th></tr>
          </thead>
          <tbody>
            {#each recientes as m (m.id)}
              <tr>
                <td class="suave">{formatearFechaHora(m.creadoEn)}</td>
                <td><a href="#/productos/{m.productoId}">{nombreProducto(m.productoId)}</a></td>
                <td title={m.motivo}>{TIPOS_MOVIMIENTO[m.tipo].nombre}</td>
                <td class="derecha num" class:positivo={m.cantidad > 0} class:negativo={m.cantidad < 0}>
                  {m.cantidad > 0 ? '+' : ''}{formatearCantidad(m.cantidad)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

<style>
  .dos-columnas {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .positivo {
    color: var(--exito);
  }

  .negativo {
    color: var(--peligro);
  }

  @media (max-width: 960px) {
    .dos-columnas {
      grid-template-columns: 1fr;
    }
  }
</style>
