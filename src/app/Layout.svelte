<script lang="ts">
  import type { Component } from 'svelte';
  import Icono from '../ui/Icono.svelte';
  import BarraSuperior from './BarraSuperior.svelte';
  import { puede } from './estado.svelte';
  import type { PropsPantalla, Ruta } from './modulos';
  import { MENU, RUTAS } from './registro';
  import { navegacion, navegar, resolver } from './router.svelte';

  const actual = $derived(resolver(RUTAS, navegacion.ruta));
  const menu = $derived(MENU.filter((m) => !m.permiso || puede(m.permiso)));

  // Se guarda junto con la ruta a la que pertenece: así, al navegar, la
  // pantalla anterior nunca se dibuja (ni un instante) con los parámetros de la nueva.
  let cargada = $state.raw<{ ruta: Ruta; componente: Component<PropsPantalla> } | null>(null);
  let errorCarga = $state(false);
  const Pantalla = $derived(cargada && actual && cargada.ruta === actual.ruta ? cargada.componente : null);

  $effect(() => {
    const destino = actual;
    errorCarga = false;
    if (!destino) return;
    let vigente = true;
    destino.ruta
      .cargar()
      .then((m) => {
        if (vigente) cargada = { ruta: destino.ruta, componente: m.default };
      })
      .catch(() => {
        if (vigente) errorCarga = true;
      });
    return () => {
      vigente = false;
    };
  });

  function activo(ruta: string): boolean {
    return navegacion.ruta === ruta || navegacion.ruta.startsWith(ruta + '/');
  }

  // F2 desde cualquier pantalla: ir a buscar un producto.
  function alTeclear(e: KeyboardEvent) {
    if (e.key !== 'F2') return;
    e.preventDefault();
    const buscador = document.querySelector<HTMLInputElement>('[data-busqueda]');
    if (buscador) buscador.focus();
    else navegar('/vender');
  }
</script>

<svelte:window onkeydown={alTeclear} />

<div class="marco">
  <BarraSuperior />
  <nav class="menu" aria-label="Menú principal">
    {#each menu as entrada (entrada.ruta)}
      <a href="#{entrada.ruta}" class:activo={activo(entrada.ruta)} aria-current={activo(entrada.ruta) ? 'page' : undefined}>
        <span class="icono-menu">
          <Icono nombre={entrada.icono} tamano={22} />
          {#if entrada.insignia && entrada.insignia() > 0}
            <span class="insignia num" aria-label="{entrada.insignia()} por atender">{entrada.insignia()}</span>
          {/if}
        </span>
        <span>{entrada.titulo}</span>
      </a>
    {/each}
  </nav>
  <main>
    {#if !actual}
      <div class="vacio">
        <p>Esta página no existe.</p>
        <p><a href="#/precios">Ir a consultar precios</a></p>
      </div>
    {:else if actual.ruta.permiso && !puede(actual.ruta.permiso)}
      <div class="alerta alerta-aviso">Tu usuario no tiene permiso para entrar aquí.</div>
    {:else if errorCarga}
      <div class="alerta alerta-peligro">No se pudo cargar esta pantalla. Recarga la página.</div>
    {:else if Pantalla}
      {#key navegacion.ruta + '?' + navegacion.consulta.toString()}
        <Pantalla params={actual.params} consulta={navegacion.consulta} />
      {/key}
    {/if}
  </main>
</div>

<style>
  .marco {
    display: grid;
    grid-template-columns: 220px 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'barra barra'
      'menu principal';
    min-height: 100vh;
  }

  .menu {
    grid-area: menu;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem 0.75rem;
    border-right: 1px solid var(--borde);
    background: var(--superficie);
  }

  .menu a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 46px;
    padding: 0 0.85rem;
    border-radius: var(--radio-chico);
    color: var(--texto);
    text-decoration: none;
    font-weight: 600;
  }

  .menu a:hover {
    background: var(--superficie-2);
  }

  .icono-menu {
    position: relative;
    display: inline-flex;
  }

  .insignia {
    position: absolute;
    top: -7px;
    right: -10px;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--aviso);
    color: var(--superficie);
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }

  .menu a.activo {
    background: var(--primario-suave);
    color: var(--primario);
  }

  main {
    grid-area: principal;
    padding: 1.5rem;
    min-width: 0;
    max-width: 1200px;
    width: 100%;
  }

  @media (max-width: 760px) {
    .marco {
      grid-template-columns: 1fr;
      grid-template-areas:
        'barra'
        'principal';
    }

    main {
      padding: 1rem 1rem calc(88px + env(safe-area-inset-bottom));
    }

    .menu {
      position: fixed;
      z-index: 50;
      left: 0;
      right: 0;
      bottom: 0;
      flex-direction: row;
      justify-content: flex-start;
      /* Con muchos módulos el menú se desliza de lado en vez de apretarse. */
      overflow-x: auto;
      scrollbar-width: none;
      padding: 0.35rem 0.25rem calc(0.35rem + env(safe-area-inset-bottom));
      border-right: 0;
      border-top: 1px solid var(--borde);
    }

    .menu::-webkit-scrollbar {
      display: none;
    }

    .menu a {
      flex: 1 0 68px;
      flex-direction: column;
      gap: 0.15rem;
      min-height: 56px;
      padding: 0.35rem 0.25rem;
      justify-content: center;
      font-size: 0.72rem;
      text-align: center;
    }
  }
</style>
