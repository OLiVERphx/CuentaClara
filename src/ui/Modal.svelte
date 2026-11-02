<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    abierto = $bindable(false),
    titulo,
    children,
    acciones,
  }: { abierto?: boolean; titulo: string; children: Snippet; acciones?: Snippet } = $props();

  let dialogo: HTMLDialogElement;

  $effect(() => {
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  });
</script>

<dialog bind:this={dialogo} onclose={() => (abierto = false)} aria-labelledby="titulo-modal">
  <div class="contenido pila">
    <h2 id="titulo-modal">{titulo}</h2>
    {@render children()}
  </div>
  {#if acciones}
    <div class="acciones">{@render acciones()}</div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 2rem));
    padding: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
    color: var(--texto);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.3);
  }

  dialog::backdrop {
    background: rgb(10 15 20 / 0.55);
  }

  .contenido {
    padding: 1.25rem;
  }

  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.9rem 1.25rem;
    border-top: 1px solid var(--borde);
    background: var(--superficie-2);
  }
</style>
