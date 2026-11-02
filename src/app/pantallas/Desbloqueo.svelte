<script lang="ts">
  import { onMount } from 'svelte';
  import { esperaPorBloqueo, ingresar, listarUsuariosActivos } from '../../core/auth/usuarios';
  import type { Usuario } from '../../core/db/tipos';
  import { NOMBRE_ROL } from '../../core/auth/permisos';
  import { mensajeDeError } from '../../core/errores';
  import Icono from '../../ui/Icono.svelte';
  import TecladoPin from '../../ui/TecladoPin.svelte';
  import { abrirSesion, app } from '../estado.svelte';

  let usuarios = $state<Usuario[]>([]);
  let elegido = $state<Usuario | null>(null);
  let pin = $state('');
  let mensaje = $state('');
  let verificando = $state(false);
  let esperaSegundos = $state(0);
  let temporizador: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    void (async () => {
      usuarios = await listarUsuariosActivos();
      if (usuarios.length === 1) elegido = usuarios[0]!;
      iniciarEspera(await esperaPorBloqueo());
    })();
    return () => clearInterval(temporizador);
  });

  function iniciarEspera(ms: number) {
    clearInterval(temporizador);
    esperaSegundos = Math.ceil(ms / 1000);
    if (esperaSegundos <= 0) return;
    temporizador = setInterval(() => {
      esperaSegundos--;
      if (esperaSegundos <= 0) {
        clearInterval(temporizador);
        mensaje = '';
      }
    }, 1000);
  }

  async function entrar() {
    if (!elegido || verificando || esperaSegundos > 0) return;
    verificando = true;
    try {
      const r = await ingresar(elegido.id, pin);
      if (r.ok) {
        abrirSesion(r.usuario);
        return;
      }
      pin = '';
      if (r.esperaMs > 0) {
        mensaje = 'Demasiados intentos fallidos.';
        iniciarEspera(r.esperaMs);
      } else {
        mensaje = `PIN incorrecto. ${r.intentosRestantes === 1 ? 'Te queda 1 intento' : `Te quedan ${r.intentosRestantes} intentos`} antes de una espera.`;
      }
    } catch (e) {
      mensaje = mensajeDeError(e);
    } finally {
      verificando = false;
    }
  }
</script>

<div class="fondo">
  <div class="caja tarjeta pila">
    <div class="encabezado">
      <Icono nombre="candado" tamano={28} />
      <h1>{app.negocio?.nombre}</h1>
    </div>

    {#if !elegido}
      <p class="suave">¿Quién va a trabajar?</p>
      <div class="pila-chica">
        {#each usuarios as u (u.id)}
          <button class="btn btn-grande" onclick={() => (elegido = u)}>{u.nombre} <span class="suave">· {NOMBRE_ROL[u.rol]}</span></button>
        {/each}
      </div>
    {:else}
      <p>Hola, <strong>{elegido.nombre}</strong>. Escribe tu PIN.</p>
      <TecladoPin bind:valor={pin} onEnviar={entrar} deshabilitado={verificando || esperaSegundos > 0} />
      {#if esperaSegundos > 0}
        <div class="alerta alerta-aviso" role="alert">{mensaje} Espera {esperaSegundos} s para intentar de nuevo.</div>
      {:else if mensaje}
        <div class="alerta alerta-peligro" role="alert">{mensaje}</div>
      {/if}
      {#if usuarios.length > 1}
        <button class="btn btn-fantasma btn-chico" onclick={() => { elegido = null; pin = ''; mensaje = ''; }}>Cambiar de usuario</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .fondo {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .caja {
    width: min(380px, 100%);
    align-items: center;
    text-align: center;
    padding: 1.75rem 1.25rem;
  }

  .encabezado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: var(--primario);
  }

  .encabezado h1 {
    color: var(--texto);
    font-size: 1.3rem;
  }

  .pila-chica {
    width: 100%;
  }
</style>
