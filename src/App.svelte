<script lang="ts">
  import { onMount } from 'svelte';
  import { arrancar } from './app/arranque';
  import { app } from './app/estado.svelte';
  import Layout from './app/Layout.svelte';
  import Asistente from './app/pantallas/Asistente.svelte';
  import Desbloqueo from './app/pantallas/Desbloqueo.svelte';
  import ActualizacionPwa from './ui/ActualizacionPwa.svelte';
  import Avisos from './ui/Avisos.svelte';

  onMount(arrancar);

  $effect(() => {
    document.title = app.negocio?.nombre ? `${app.negocio.nombre} · Bodega` : 'Bodega';
  });
</script>

{#if app.fase === 'cargando'}
  <div class="centro suave">Cargando…</div>
{:else if app.fase === 'error'}
  <div class="centro">
    <div class="alerta alerta-peligro">{app.error}</div>
  </div>
{:else if app.fase === 'asistente'}
  <Asistente />
{:else if app.fase === 'bloqueado'}
  <Desbloqueo />
{:else}
  <Layout />
{/if}

<Avisos />
<ActualizacionPwa />

<style>
  .centro {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
</style>
