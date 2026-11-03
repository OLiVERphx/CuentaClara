<script lang="ts">
  import { tick } from 'svelte';
  import { puede } from '../../../app/estado.svelte';
  import Icono from '../../../ui/Icono.svelte';
  import { avisarError } from '../../../ui/notificaciones.svelte';
  import { clientes } from '../almacen.svelte';
  import { crearCliente } from '../servicio';
  import EtiquetaSaldo from './EtiquetaSaldo.svelte';

  let { clienteId = $bindable(null) }: { clienteId?: string | null } = $props();

  let abierto = $state(false);
  let texto = $state('');
  let activo = $state(0);
  let campo = $state<HTMLInputElement>();

  const elegido = $derived.by(() => {
    void clientes.version;
    return clientes.obtener(clienteId);
  });
  const resultados = $derived.by(() => {
    void clientes.version;
    return clientes.buscar(texto, 6);
  });

  async function abrir() {
    abierto = true;
    texto = '';
    activo = 0;
    await tick();
    campo?.focus();
  }

  function elegir(id: string) {
    clienteId = id;
    abierto = false;
  }

  async function crearRapido() {
    try {
      const nuevo = await crearCliente({ nombre: texto, cedula: '', telefono: '', limiteCreditoUsd: null, nota: '', activo: true });
      elegir(nuevo.id);
    } catch (e) {
      avisarError(e);
    }
  }

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') activo = Math.min(activo + 1, resultados.length - 1);
    else if (e.key === 'ArrowUp') activo = Math.max(activo - 1, 0);
    else if (e.key === 'Enter' && resultados[activo]) elegir(resultados[activo]!.id);
    else if (e.key === 'Escape') abierto = false;
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div class="selector-cliente">
  {#if elegido && !abierto}
    <div class="elegido">
      <Icono nombre="personas" tamano={18} />
      <a href="#/clientes/{elegido.id}" class="nombre">{elegido.nombre}</a>
      <EtiquetaSaldo saldoUsd={elegido.saldoUsd} />
      <button class="btn btn-fantasma btn-chico" onclick={abrir}>Cambiar</button>
      <button class="btn btn-fantasma btn-chico" aria-label="Quitar cliente" onclick={() => (clienteId = null)}><Icono nombre="cerrar" tamano={16} /></button>
    </div>
  {:else if !abierto}
    <button class="btn btn-chico" onclick={abrir}><Icono nombre="personas" tamano={16} /> Cliente (para fiar)</button>
  {:else}
    <div class="buscar">
      <input
        bind:this={campo}
        bind:value={texto}
        oninput={() => (activo = 0)}
        onkeydown={alTeclear}
        onblur={() => setTimeout(() => (abierto = false), 150)}
        placeholder="Nombre, cédula o teléfono…"
        aria-label="Buscar cliente"
        autocomplete="off"
      />
      <ul class="lista" role="listbox">
        {#each resultados as c, i (c.id)}
          <li role="option" aria-selected={i === activo}>
            <button type="button" class:activo={i === activo} onmousedown={(e) => e.preventDefault()} onclick={() => elegir(c.id)}>
              <span>{c.nombre}</span>
              <EtiquetaSaldo saldoUsd={c.saldoUsd} />
            </button>
          </li>
        {/each}
        {#if texto.trim() && puede('clientes.gestionar')}
          <li>
            <button type="button" class="crear" onmousedown={(e) => e.preventDefault()} onclick={crearRapido}>
              <Icono nombre="mas" tamano={16} /> Crear cliente «{texto.trim()}»
            </button>
          </li>
        {:else if resultados.length === 0}
          <li class="ayuda vacio-lista">Escribe para buscar.</li>
        {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .selector-cliente {
    position: relative;
  }

  .elegido {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--primario);
    border-radius: var(--radio-chico);
    background: var(--primario-suave);
    color: var(--primario);
  }

  .nombre {
    font-weight: 700;
    color: var(--texto);
    text-decoration: none;
  }

  .buscar input {
    min-height: 40px;
  }

  .lista {
    position: absolute;
    z-index: 20;
    left: 0;
    right: 0;
    margin: 0.25rem 0 0;
    padding: 0.25rem;
    list-style: none;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
  }

  .lista button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 42px;
    padding: 0.35rem 0.6rem;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--texto);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .lista button:hover,
  .lista button.activo {
    background: var(--primario-suave);
  }

  .crear {
    color: var(--primario) !important;
    font-weight: 600 !important;
    justify-content: flex-start !important;
  }

  .vacio-lista {
    padding: 0.5rem 0.6rem;
  }
</style>
