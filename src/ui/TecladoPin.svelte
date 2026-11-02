<script lang="ts">
  import Icono from './Icono.svelte';

  let {
    valor = $bindable(''),
    onEnviar,
    deshabilitado = false,
    textoBoton = 'Entrar',
  }: { valor?: string; onEnviar: () => void; deshabilitado?: boolean; textoBoton?: string } = $props();

  const MAXIMO = 6;

  function pulsar(digito: string) {
    if (!deshabilitado && valor.length < MAXIMO) valor += digito;
  }

  function borrar() {
    valor = valor.slice(0, -1);
  }

  function enviar() {
    if (!deshabilitado && valor.length >= 4) onEnviar();
  }

  // El teclado físico también funciona (laptop).
  function alTeclear(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (/^\d$/.test(e.key)) pulsar(e.key);
    else if (e.key === 'Backspace') borrar();
    else if (e.key === 'Enter') enviar();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="teclado">
  <div class="puntos" aria-label="{valor.length} dígitos escritos">
    {#each Array(MAXIMO) as _, i}
      <span class="punto" class:lleno={i < valor.length}></span>
    {/each}
  </div>
  <div class="teclas">
    {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d}
      <button type="button" class="tecla" disabled={deshabilitado} onclick={() => pulsar(d)}>{d}</button>
    {/each}
    <button type="button" class="tecla" aria-label="Borrar" disabled={deshabilitado} onclick={borrar}>
      <Icono nombre="atras" />
    </button>
    <button type="button" class="tecla" disabled={deshabilitado} onclick={() => pulsar('0')}>0</button>
    <button type="button" class="tecla tecla-ok" aria-label={textoBoton} disabled={deshabilitado || valor.length < 4} onclick={enviar}>
      <Icono nombre="check" />
    </button>
  </div>
</div>

<style>
  .teclado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }

  .puntos {
    display: flex;
    gap: 0.75rem;
  }

  .punto {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--texto-suave);
  }

  .punto.lleno {
    background: var(--primario);
    border-color: var(--primario);
  }

  .teclas {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 0.75rem;
  }

  .tecla {
    height: 64px;
    border-radius: 50%;
    border: 1px solid var(--borde);
    background: var(--superficie);
    color: var(--texto);
    font: inherit;
    font-size: 1.5rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tecla:hover:not(:disabled) {
    background: var(--superficie-2);
  }

  .tecla:disabled {
    opacity: 0.5;
  }

  .tecla-ok:not(:disabled) {
    background: var(--primario);
    border-color: var(--primario);
    color: var(--sobre-primario);
  }
</style>
