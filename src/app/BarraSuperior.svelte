<script lang="ts">
  import { formatearTasa } from '../core/dinero/dinero';
  import { formatearFecha } from '../core/util/fechas';
  import Icono from '../ui/Icono.svelte';
  import { app, bloquear, tasaDelDia, tasaVieja } from './estado.svelte';

  const aplicada = $derived(tasaDelDia());
  const vieja = $derived(tasaVieja());
</script>

<header class="barra">
  <div class="negocio">
    <Icono nombre="tienda" />
    <strong>{app.negocio?.nombre}</strong>
  </div>

  <a class="tasa" class:tasa-vieja={vieja} class:tasa-falta={!app.tasa} href="#/config?seccion=tasa" title="Ver o cargar la tasa">
    {#if app.tasa && aplicada !== null}
      {#if vieja}<Icono nombre="alerta" tamano={16} />{/if}
      <span class="suave">BCV</span>
      <span class="num">{formatearTasa(app.tasa.valor)}</span>
      <span class="suave fecha">· {formatearFecha(app.tasa.fechaValor)}</span>
      {#if aplicada !== app.tasa.valor}
        <span class="chip chip-primario num" title="Tasa con el ajuste del negocio">Aplicada {formatearTasa(aplicada)}</span>
      {/if}
    {:else}
      <Icono nombre="alerta" tamano={16} />
      <span>Sin tasa: cárgala aquí</span>
    {/if}
  </a>

  <div class="derecha">
    <span class="conexion" class:sin-conexion={!app.enLinea} title={app.enLinea ? 'Con internet' : 'Sin internet: todo sigue funcionando'}>
      <span class="punto"></span><span class="texto-conexion">{app.enLinea ? 'En línea' : 'Sin internet'}</span>
    </span>
    <span class="usuario">{app.usuario?.nombre}</span>
    <button class="btn btn-chico" onclick={bloquear} title="Bloquear (pedir PIN)">
      <Icono nombre="candado" tamano={16} /><span class="texto-bloquear">Bloquear</span>
    </button>
  </div>
</header>

<style>
  .barra {
    grid-area: barra;
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--superficie);
    border-bottom: 1px solid var(--borde);
    min-height: 58px;
  }

  .negocio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--primario);
    min-width: 0;
  }

  .negocio strong {
    color: var(--texto);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 22ch;
  }

  .tasa {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: var(--superficie-2);
    color: var(--texto);
    text-decoration: none;
    font-weight: 700;
    white-space: nowrap;
  }

  .tasa:hover {
    outline: 1px solid var(--borde);
  }

  .tasa-vieja {
    background: var(--aviso-suave);
    color: var(--aviso);
  }

  .tasa-falta {
    background: var(--peligro-suave);
    color: var(--peligro);
  }

  .fecha {
    font-weight: 500;
  }

  .derecha {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .conexion {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--texto-suave);
  }

  .punto {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--exito);
  }

  .sin-conexion .punto {
    background: var(--aviso);
  }

  .usuario {
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .barra {
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
    }

    .negocio strong,
    .usuario,
    .texto-conexion,
    .texto-bloquear,
    .fecha {
      display: none;
    }
  }
</style>
