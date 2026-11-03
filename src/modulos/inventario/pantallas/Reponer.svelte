<script lang="ts">
  import { app, puede } from '../../../app/estado.svelte';
  import { formatearCantidad } from '../../../core/dinero/dinero';
  import Icono from '../../../ui/Icono.svelte';
  import { avisar } from '../../../ui/notificaciones.svelte';
  import { compras } from '../../compras/almacen.svelte';
  import { ultimoProveedorPorProducto } from '../../compras/servicio';
  import { vendidoPorProducto } from '../../ventas/consultas';
  import { inventario } from '../almacen.svelte';
  import { DIAS_COBERTURA, DIAS_HISTORIAL, sugerirReposicion, type Sugerencia } from '../reposicion';
  import type { Presentacion } from '../tipos';

  let sugerencias = $state<Sugerencia[]>([]);
  let proveedores = $state(new Map<string, string>());
  let cargando = $state(true);

  $effect(() => {
    void inventario.version;
    void (async () => {
      const todos = inventario.indice.todos();
      const presentaciones = new Map<string, Presentacion[]>();
      for (const p of todos) presentaciones.set(p.id, inventario.indice.obtener(p.id)?.presentaciones ?? []);
      const vendido = await vendidoPorProducto(app.hoy, DIAS_HISTORIAL);
      sugerencias = sugerirReposicion(todos, presentaciones, vendido);
      proveedores = puede('compras.gestionar') ? await ultimoProveedorPorProducto(sugerencias.map((s) => s.producto.id)) : new Map();
      cargando = false;
    })();
  });

  const grupos = $derived.by(() => {
    const m = new Map<string, Sugerencia[]>();
    for (const s of sugerencias) {
      const clave = proveedores.get(s.producto.id) ?? '';
      m.set(clave, [...(m.get(clave) ?? []), s]);
    }
    return [...m].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : compras.nombreProveedor(a).localeCompare(compras.nombreProveedor(b))));
  });

  const MOTIVO = { agotado: 'Agotado', bajo: 'Bajo el mínimo', se_acaba: 'Se acaba pronto' };

  function pedido(s: Sugerencia): string {
    return s.presentacion
      ? `${s.sugerido} × ${s.presentacion.nombre}`
      : formatearCantidad(s.sugeridoBase, s.producto.unidad) + (s.producto.unidad === 'unidad' ? ' und' : '');
  }

  async function copiar() {
    const texto = grupos
      .map(([prov, lista]) => `${prov ? compras.nombreProveedor(prov) : 'Sin proveedor'}:\n` + lista.map((s) => `- ${s.producto.nombre}: ${pedido(s)}`).join('\n'))
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(`Pedido ${app.negocio?.nombre ?? ''}\n\n${texto}`);
      avisar('Lista copiada. Pégala en WhatsApp o en una nota.');
    } catch {
      avisar('No se pudo copiar. Usa Imprimir.', 'error');
    }
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma no-imprimir" href="#/inventario" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Por reponer</h1>
  </div>
  {#if sugerencias.length > 0}
    <div class="fila no-imprimir">
      <button class="btn" onclick={copiar}>Copiar lista</button>
      <button class="btn" onclick={() => window.print()}><Icono nombre="imprimir" /> Imprimir</button>
    </div>
  {/if}
</div>
<p class="ayuda">
  Productos agotados, bajo su mínimo o que se acaban en menos de 3 días. La cantidad sugerida cubre {DIAS_COBERTURA} días de ventas
  (según los últimos {DIAS_HISTORIAL}) o el doble del mínimo, lo que sea mayor.
</p>

{#if cargando}
  <p class="vacio">Calculando…</p>
{:else if sugerencias.length === 0}
  <div class="tarjeta vacio">Todo en orden: no hay nada que reponer.</div>
{:else}
  {#each grupos as [prov, lista] (prov)}
    <section class="grupo">
      <h2>{prov ? compras.nombreProveedor(prov) : 'Sin proveedor registrado'}</h2>
      <div class="tabla-contenedor">
        <table>
          <thead>
            <tr><th>Producto</th><th class="derecha">Stock</th><th class="derecha ocultable">Alcanza</th><th class="derecha">Pedir</th><th class="ocultable"></th></tr>
          </thead>
          <tbody>
            {#each lista as s (s.producto.id)}
              <tr>
                <td><a href="#/productos/{s.producto.id}">{s.producto.nombre}</a></td>
                <td class="derecha num">{formatearCantidad(s.producto.stock, s.producto.unidad)}</td>
                <td class="derecha num ocultable">{s.diasQueAlcanza === null ? '—' : `${s.diasQueAlcanza} ${s.diasQueAlcanza === 1 ? 'día' : 'días'}`}</td>
                <td class="derecha num"><strong>{pedido(s)}</strong></td>
                <td class="ocultable">
                  <span class="chip" class:chip-agotado={s.motivo === 'agotado'} class:chip-bajo={s.motivo !== 'agotado'}>{MOTIVO[s.motivo]}</span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}
{/if}

<style>
  .grupo {
    margin-top: 1rem;
  }

  .grupo h2 {
    margin-bottom: 0.5rem;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
