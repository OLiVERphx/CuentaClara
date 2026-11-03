<script lang="ts">
  import { formatearBs, formatearUsd } from '../../../core/dinero/dinero';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { compras } from '../almacen.svelte';
  import { guardarProveedor, listarCompras, type DatosProveedor } from '../servicio';
  import type { Compra, Proveedor } from '../tipos';

  let pendientes = $state<Compra[]>([]);
  $effect(() => {
    void compras.version;
    void listarCompras({ soloPendientes: true }).then((r) => (pendientes = r));
  });

  function deuda(p: Proveedor): { usd: number; bs: number } {
    let usd = 0;
    let bs = 0;
    for (const c of pendientes) {
      if (c.proveedorId !== p.id) continue;
      if (c.moneda === 'USD') usd += c.total - c.pagado;
      else bs += c.total - c.pagado;
    }
    return { usd, bs };
  }

  let abierto = $state(false);
  let editandoId = $state<string | null>(null);
  let datos = $state<DatosProveedor>({ nombre: '', rif: '', telefono: '', contacto: '', nota: '', activo: true });

  function abrir(p: Proveedor | null) {
    editandoId = p?.id ?? null;
    datos = p
      ? { nombre: p.nombre, rif: p.rif, telefono: p.telefono, contacto: p.contacto, nota: p.nota, activo: p.activo }
      : { nombre: '', rif: '', telefono: '', contacto: '', nota: '', activo: true };
    abierto = true;
  }

  async function guardar() {
    try {
      await guardarProveedor(editandoId, datos);
      avisar(editandoId ? 'Proveedor actualizado.' : 'Proveedor creado.');
      abierto = false;
    } catch (e) {
      avisarError(e);
    }
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma" href="#/compras" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Proveedores</h1>
  </div>
  <button class="btn btn-primario" onclick={() => abrir(null)}><Icono nombre="mas" /> Nuevo proveedor</button>
</div>

{#if compras.proveedores.length === 0}
  <p class="tarjeta vacio">Todavía no hay proveedores.</p>
{:else}
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr><th>Nombre</th><th class="ocultable">RIF</th><th class="ocultable">Teléfono</th><th class="derecha">Le debes</th><th></th></tr>
      </thead>
      <tbody>
        {#each compras.proveedores as p (p.id)}
          {@const d = deuda(p)}
          <tr class:inactivo={!p.activo}>
            <td>
              <a href="#/compras?proveedor={p.id}"><strong>{p.nombre}</strong></a>
              {#if p.contacto}<span class="ayuda"> · {p.contacto}</span>{/if}
            </td>
            <td class="ocultable mono">{p.rif}</td>
            <td class="ocultable">{p.telefono}</td>
            <td class="derecha num">
              {#if d.usd}<span class="deuda">{formatearUsd(d.usd)}</span>{/if}
              {#if d.bs}<span class="deuda"> {formatearBs(d.bs)}</span>{/if}
              {#if !d.usd && !d.bs}<span class="suave">—</span>{/if}
            </td>
            <td class="derecha"><button class="btn btn-chico btn-fantasma" onclick={() => abrir(p)}>Editar</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:abierto titulo={editandoId ? 'Editar proveedor' : 'Nuevo proveedor'}>
  <label class="campo">
    <span>Nombre *</span>
    <input bind:value={datos.nombre} maxlength="80" />
  </label>
  <div class="rejilla">
    <label class="campo">
      <span>RIF</span>
      <input bind:value={datos.rif} placeholder="J-12345678-9" />
    </label>
    <label class="campo">
      <span>Teléfono</span>
      <input bind:value={datos.telefono} inputmode="tel" />
    </label>
  </div>
  <label class="campo">
    <span>Persona de contacto</span>
    <input bind:value={datos.contacto} maxlength="60" placeholder="El vendedor que pasa los martes" />
  </label>
  <label class="campo">
    <span>Nota</span>
    <input bind:value={datos.nota} maxlength="200" />
  </label>
  {#if editandoId}<label class="casilla"><input type="checkbox" bind:checked={datos.activo} /> Activo</label>{/if}
  {#snippet acciones()}
    <button class="btn" onclick={() => (abierto = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={!datos.nombre.trim()} onclick={guardar}>Guardar</button>
  {/snippet}
</Modal>

<style>
  .deuda {
    color: var(--peligro);
    font-weight: 600;
  }

  .inactivo td {
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
