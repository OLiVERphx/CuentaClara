<script lang="ts">
  import { avisos, cerrarAviso } from './notificaciones.svelte';
  import Icono from './Icono.svelte';
</script>

<div class="avisos" aria-live="polite">
  {#each avisos as aviso (aviso.id)}
    <div class="aviso aviso-{aviso.tipo}" role={aviso.tipo === 'error' ? 'alert' : 'status'}>
      <Icono nombre={aviso.tipo === 'error' ? 'alerta' : 'check'} />
      <span>{aviso.texto}</span>
      <button class="btn btn-fantasma btn-chico" aria-label="Cerrar aviso" onclick={() => cerrarAviso(aviso.id)}>
        <Icono nombre="cerrar" tamano={16} />
      </button>
    </div>
  {/each}
</div>

<style>
  .avisos {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: min(420px, calc(100vw - 2rem));
  }

  .aviso {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.5rem 0.5rem 0.9rem;
    border-radius: var(--radio);
    background: var(--superficie);
    border: 1px solid var(--borde);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.15);
    font-weight: 500;
  }

  .aviso span {
    flex: 1;
  }

  .aviso-exito {
    border-left: 4px solid var(--exito);
  }

  .aviso-error {
    border-left: 4px solid var(--peligro);
    color: var(--peligro);
  }

  .aviso-info {
    border-left: 4px solid var(--primario);
  }

  @media (max-width: 760px) {
    .avisos {
      bottom: calc(76px + env(safe-area-inset-bottom));
      left: 1rem;
    }
  }
</style>
