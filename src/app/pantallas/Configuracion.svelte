<script lang="ts">
  import Icono, { type NombreIcono } from '../../ui/Icono.svelte';
  import { puede } from '../estado.svelte';
  import type { PropsPantalla } from '../modulos';
  import SeccionNegocio from './config/SeccionNegocio.svelte';
  import SeccionRespaldo from './config/SeccionRespaldo.svelte';
  import SeccionSeguridad from './config/SeccionSeguridad.svelte';
  import SeccionTasa from './config/SeccionTasa.svelte';

  let { consulta }: PropsPantalla = $props();

  const SECCIONES: { id: string; titulo: string; icono: NombreIcono; visible: () => boolean }[] = [
    { id: 'tasa', titulo: 'Tasa del día', icono: 'dolar', visible: () => true },
    { id: 'negocio', titulo: 'Negocio', icono: 'tienda', visible: () => puede('config.editar') },
    { id: 'seguridad', titulo: 'Seguridad y equipo', icono: 'escudo', visible: () => true },
    { id: 'respaldo', titulo: 'Respaldos', icono: 'nube', visible: () => puede('respaldo.gestionar') },
  ];

  const visibles = $derived(SECCIONES.filter((s) => s.visible()));
  const actual = $derived(visibles.find((s) => s.id === consulta.get('seccion')) ?? visibles[0]!);
</script>

<div class="encabezado-pagina">
  <h1>Configuración</h1>
</div>

<div class="config">
  <nav class="pestanas" aria-label="Secciones de configuración">
    {#each visibles as s (s.id)}
      <a href="#/config?seccion={s.id}" class:activa={s.id === actual.id} aria-current={s.id === actual.id ? 'page' : undefined}>
        <Icono nombre={s.icono} tamano={18} />
        {s.titulo}
      </a>
    {/each}
  </nav>
  <section>
    {#if actual.id === 'tasa'}
      <SeccionTasa />
    {:else if actual.id === 'negocio'}
      <SeccionNegocio />
    {:else if actual.id === 'seguridad'}
      <SeccionSeguridad />
    {:else if actual.id === 'respaldo'}
      <SeccionRespaldo />
    {/if}
  </section>
</div>

<style>
  .config {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .pestanas {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pestanas a {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: var(--radio-chico);
    color: var(--texto);
    text-decoration: none;
    font-weight: 600;
  }

  .pestanas a:hover {
    background: var(--superficie-2);
  }

  .pestanas a.activa {
    background: var(--superficie);
    border: 1px solid var(--borde);
    color: var(--primario);
  }

  section {
    min-width: 0;
  }

  @media (max-width: 900px) {
    .config {
      grid-template-columns: 1fr;
    }

    .pestanas {
      flex-direction: row;
      overflow-x: auto;
    }

    .pestanas a {
      white-space: nowrap;
    }
  }
</style>
