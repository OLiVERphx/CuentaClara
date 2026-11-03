<script lang="ts">
  import { puede, redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import { formatearBs, formatearCantidad, formatearUsd } from '../../../core/dinero/dinero';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import { enUsd, estadoStock, precioEnBs } from '../precios';
  import type { Producto } from '../tipos';

  type Filtro = 'activos' | 'bajo' | 'agotado' | 'inactivos' | 'todos';

  let texto = $state('');
  let categoriaId = $state('');
  let filtro = $state<Filtro>('activos');
  let limite = $state(200);

  const tasa = $derived(tasaDelDia());
  const redondeo = $derived(redondeoBs());

  const lista = $derived.by(() => {
    void inventario.version;
    const base: Producto[] = texto.trim()
      ? inventario.indice.buscar(texto, { limite: 5000, incluirInactivos: true }).map((r) => r.producto)
      : inventario.indice.todos().sort((a, b) => a.nombre.localeCompare(b.nombre));
    return base.filter((p) => {
      if (categoriaId && p.categoriaId !== categoriaId) return false;
      switch (filtro) {
        case 'activos':
          return p.activo;
        case 'inactivos':
          return !p.activo;
        case 'bajo':
          return p.activo && estadoStock(p) === 'bajo';
        case 'agotado':
          return p.activo && estadoStock(p) === 'agotado';
        default:
          return true;
      }
    });
  });

  const ETIQUETA = { agotado: 'Agotado', bajo: 'Bajo', normal: 'OK' };
</script>

<div class="encabezado-pagina">
  <h1>Productos</h1>
  {#if puede('productos.editar')}
    <div class="fila">
      <a class="btn" href="#/inventario/importar"><Icono nombre="subir" /> Importar CSV</a>
      <a class="btn btn-primario" href="#/productos/nuevo"><Icono nombre="mas" /> Nuevo producto</a>
    </div>
  {/if}
</div>

<div class="filtros">
  <input type="search" bind:value={texto} placeholder="Filtrar por nombre o código…" aria-label="Filtrar productos" />
  <select bind:value={categoriaId} aria-label="Categoría">
    <option value="">Todas las categorías</option>
    {#each inventario.categorias as c (c.id)}
      <option value={c.id}>{c.nombre}</option>
    {/each}
  </select>
  <select bind:value={filtro} aria-label="Estado">
    <option value="activos">Activos</option>
    <option value="bajo">Stock bajo</option>
    <option value="agotado">Agotados</option>
    <option value="inactivos">Inactivos</option>
    <option value="todos">Todos</option>
  </select>
</div>

{#if lista.length === 0}
  <p class="vacio">{inventario.indice.tamano === 0 ? 'Todavía no hay productos.' : 'Ningún producto coincide con el filtro.'}</p>
{:else}
  <p class="ayuda resumen">{lista.length} {lista.length === 1 ? 'producto' : 'productos'}</p>
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
          <th class="ocultable">Categoría</th>
          <th class="derecha">Precio Bs</th>
          <th class="derecha">Precio $</th>
          <th class="derecha">Stock</th>
        </tr>
      </thead>
      <tbody>
        {#each lista.slice(0, limite) as p (p.id)}
          {@const estado = estadoStock(p)}
          <tr class="clicable" class:inactivo={!p.activo} onclick={() => navegar(`/productos/${p.id}`)}>
            <td class="mono">{p.codigo}</td>
            <td>
              <a href="#/productos/{p.id}" class="enlace-fila" onclick={(e) => e.stopPropagation()}>{p.nombre}</a>
              {#if !p.activo}<span class="chip">Inactivo</span>{/if}
            </td>
            <td class="ocultable suave">{inventario.indice.nombreCategoria(p.categoriaId)}</td>
            <td class="derecha num">{tasa !== null || p.monedaPrecio === 'VES' ? formatearBs(precioEnBs(p.precio, p.monedaPrecio, tasa ?? 0, redondeo)) : '—'}</td>
            <td class="derecha num">{tasa !== null || p.monedaPrecio === 'USD' ? formatearUsd(enUsd(p.precio, p.monedaPrecio, tasa ?? 1)) : '—'}</td>
            <td class="derecha">
              <span class="chip chip-{estado} num" title={ETIQUETA[estado]}>{formatearCantidad(p.stock, p.unidad)}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if lista.length > limite}
    <div class="fila" style:justify-content="center" style:margin-top="1rem">
      <button class="btn" onclick={() => (limite += 200)}>Mostrar 200 más ({lista.length - limite} restantes)</button>
    </div>
  {/if}
{/if}

<style>
  .filtros {
    display: grid;
    grid-template-columns: 1fr 220px 160px;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .resumen {
    margin-bottom: 0.5rem;
  }

  .enlace-fila {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }

  .inactivo td {
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .filtros {
      grid-template-columns: 1fr 1fr;
    }

    .filtros input {
      grid-column: 1 / -1;
    }

    .ocultable {
      display: none;
    }
  }
</style>
