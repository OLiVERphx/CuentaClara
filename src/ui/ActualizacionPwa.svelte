<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { avisar } from './notificaciones.svelte';

  let hayVersionNueva = $state(false);
  let actualizar: ((recargar?: boolean) => Promise<void>) | null = null;

  onMount(() => {
    actualizar = registerSW({
      onNeedRefresh() {
        hayVersionNueva = true;
      },
      onOfflineReady() {
        avisar('Listo: la app ya funciona sin internet.', 'info', 5000);
      },
    });
  });
</script>

{#if hayVersionNueva}
  <div class="banda" role="status">
    <span>Hay una versión nueva de la app.</span>
    <button class="btn btn-primario btn-chico" onclick={() => actualizar?.(true)}>Actualizar ahora</button>
    <button class="btn btn-fantasma btn-chico" onclick={() => (hayVersionNueva = false)}>Más tarde</button>
  </div>
{/if}

<style>
  .banda {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 110;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.15);
    max-width: calc(100vw - 2rem);
  }
</style>
