<script lang="ts">
  import { pinValido } from '../../core/auth/pin';
  import { crearUsuario } from '../../core/auth/usuarios';
  import { guardarDispositivo, guardarNegocio, NEGOCIO_PREDETERMINADO } from '../../core/config/config';
  import { fijarDispositivo } from '../../core/db/registro';
  import { ESCALA, formatearTasa, parsearDecimal } from '../../core/dinero/dinero';
  import { ErrorNegocio, mensajeDeError } from '../../core/errores';
  import { consultarTasaOficial, type TasaConsultada } from '../../core/tasa/fuente';
  import { guardarTasaAutomatica, registrarTasaManual } from '../../core/tasa/servicio';
  import { esFechaValida, formatearFecha, hoyLocal } from '../../core/util/fechas';
  import { uuidv7 } from '../../core/util/id';
  import Icono from '../../ui/Icono.svelte';
  import TecladoPin from '../../ui/TecladoPin.svelte';
  import { prepararTrabajo } from '../arranque';
  import { abrirSesion } from '../estado.svelte';

  const PASOS = ['Negocio', 'Dueño', 'Equipo', 'Tasa'] as const;
  let paso = $state(0);
  let error = $state('');
  let guardando = $state(false);

  let negocio = $state({ nombre: '', rif: '', telefono: '', direccion: '' });
  let dueno = $state({ nombre: '' });
  let pin = $state('');
  let pinConfirmado = $state('');
  let confirmandoPin = $state(false);
  let equipo = $state({ nombre: 'Laptop', prefijo: 'L' });

  let tasaAuto = $state<TasaConsultada | null>(null);
  let consultando = $state(false);
  let errorConsulta = $state('');
  let usarManual = $state(false);
  let fechaManual = $state(hoyLocal());
  let valorManual = $state('');

  async function consultar() {
    consultando = true;
    errorConsulta = '';
    try {
      tasaAuto = await consultarTasaOficial();
    } catch (e) {
      errorConsulta = mensajeDeError(e);
      usarManual = true;
    } finally {
      consultando = false;
    }
  }

  function siguiente() {
    error = '';
    try {
      if (paso === 0 && !negocio.nombre.trim()) throw new ErrorNegocio('Escribe el nombre del negocio.');
      if (paso === 1) {
        if (!dueno.nombre.trim()) throw new ErrorNegocio('Escribe tu nombre.');
        if (!pinValido(pin)) throw new ErrorNegocio('Crea un PIN de 4 a 6 dígitos.');
      }
      if (paso === 2 && !/^[A-Za-z]{1,2}$/.test(equipo.prefijo.trim())) {
        throw new ErrorNegocio('El prefijo debe ser una o dos letras.');
      }
    } catch (e) {
      error = mensajeDeError(e);
      return;
    }
    paso++;
    if (paso === 3 && !tasaAuto && navigator.onLine) void consultar();
  }

  function pinEscrito() {
    if (!confirmandoPin) {
      confirmandoPin = true;
      return;
    }
    if (pinConfirmado !== pin) {
      error = 'Los PIN no coinciden. Escríbelo de nuevo.';
      pin = '';
      pinConfirmado = '';
      confirmandoPin = false;
      return;
    }
    siguiente();
  }

  async function finalizar() {
    error = '';
    const valor = usarManual ? parsearDecimal(valorManual, ESCALA.tasa) : (tasaAuto?.valor ?? null);
    const fechaValor = usarManual ? fechaManual : (tasaAuto?.fechaValor ?? '');
    if (!valor || valor <= 0) {
      error = 'Indica la tasa del día (Bs por dólar).';
      return;
    }
    if (!esFechaValida(fechaValor)) {
      error = 'La fecha valor no es válida.';
      return;
    }
    guardando = true;
    try {
      const cfg = await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, ...negocio }, { inicial: true });
      const dispositivo = { id: uuidv7(), nombre: equipo.nombre || 'Equipo', prefijo: equipo.prefijo };
      await guardarDispositivo(dispositivo);
      fijarDispositivo(dispositivo.id);
      const usuario = await crearUsuario({ nombre: dueno.nombre, rol: 'dueno', pin });
      abrirSesion(usuario);
      if (usarManual) await registrarTasaManual(fechaValor, valor);
      else await guardarTasaAutomatica(fechaValor, valor);
      await prepararTrabajo(cfg, { ...dispositivo, prefijo: dispositivo.prefijo.toUpperCase() });
      location.hash = '/productos';
    } catch (e) {
      error = mensajeDeError(e);
    } finally {
      guardando = false;
    }
  }
</script>

<div class="fondo">
  <div class="caja tarjeta pila">
    <div class="pila-chica">
      <div class="marca"><Icono nombre="tienda" tamano={28} /> <strong>Bienvenido</strong></div>
      <p class="suave">Configuremos tu negocio. Toma un par de minutos y solo se hace una vez.</p>
    </div>

    <ol class="pasos" aria-label="Pasos">
      {#each PASOS as nombre, i}
        <li class:hecho={i < paso} class:actual={i === paso} aria-current={i === paso ? 'step' : undefined}>
          <span class="numero">{i < paso ? '✓' : i + 1}</span>
          <span>{nombre}</span>
        </li>
      {/each}
    </ol>

    {#if paso === 0}
      <form class="pila" onsubmit={(e) => { e.preventDefault(); siguiente(); }}>
        <label class="campo">
          <span>Nombre del negocio *</span>
          <input bind:value={negocio.nombre} placeholder="Bodega La Esquina" autocomplete="organization" maxlength="80" />
        </label>
        <div class="rejilla">
          <label class="campo">
            <span>RIF (opcional)</span>
            <input bind:value={negocio.rif} placeholder="V-12345678-9" />
          </label>
          <label class="campo">
            <span>Teléfono (opcional)</span>
            <input bind:value={negocio.telefono} inputmode="tel" placeholder="0414-1234567" />
          </label>
        </div>
        <label class="campo">
          <span>Dirección (opcional)</span>
          <input bind:value={negocio.direccion} />
        </label>
        <p class="ayuda">Estos datos aparecen en los comprobantes. Se pueden cambiar después.</p>
        {@render pie()}
      </form>
    {:else if paso === 1}
      <div class="pila">
        <label class="campo">
          <span>Tu nombre *</span>
          <input bind:value={dueno.nombre} autocomplete="name" maxlength="60" />
        </label>
        <div class="pila-chica centro">
          <span class="etiqueta">{confirmandoPin ? 'Repite el PIN para confirmarlo' : 'Crea tu PIN (4 a 6 dígitos)'}</span>
          {#if confirmandoPin}
            <TecladoPin bind:valor={pinConfirmado} onEnviar={pinEscrito} textoBoton="Confirmar PIN" />
          {:else}
            <TecladoPin bind:valor={pin} onEnviar={pinEscrito} textoBoton="Continuar" />
          {/if}
          <p class="ayuda">Lo pedirá la app al abrirla y tras {NEGOCIO_PREDETERMINADO.minutosBloqueo} minutos sin uso.</p>
        </div>
        {#if error}<div class="alerta alerta-peligro">{error}</div>{/if}
        <div class="fila-separada">
          <button class="btn" onclick={() => { paso--; error = ''; }}>Atrás</button>
        </div>
      </div>
    {:else if paso === 2}
      <form class="pila" onsubmit={(e) => { e.preventDefault(); siguiente(); }}>
        <p>Cada equipo numera sus documentos con su propio prefijo. Así, cuando sumes el teléfono, nunca habrá dos ventas con el mismo número.</p>
        <div class="rejilla">
          <label class="campo">
            <span>Nombre de este equipo</span>
            <input bind:value={equipo.nombre} maxlength="30" />
          </label>
          <label class="campo">
            <span>Prefijo (1 o 2 letras)</span>
            <input bind:value={equipo.prefijo} maxlength="2" class="mono" />
          </label>
        </div>
        <p class="ayuda">Ejemplo: la venta 123 de este equipo será <span class="mono">{equipo.prefijo.toUpperCase() || 'L'}-000123</span>.</p>
        {@render pie()}
      </form>
    {:else}
      <form class="pila" onsubmit={(e) => { e.preventDefault(); void finalizar(); }}>
        <p>La tasa oficial del BCV convierte tus precios en dólares a bolívares.</p>
        {#if !usarManual}
          {#if consultando}
            <div class="alerta alerta-info">Consultando la tasa oficial…</div>
          {:else if tasaAuto}
            <div class="tasa-encontrada">
              <span class="suave">Tasa BCV</span>
              <strong class="num">{formatearTasa(tasaAuto.valor)} Bs/USD</strong>
              <span class="suave">Fecha valor {formatearFecha(tasaAuto.fechaValor)}</span>
            </div>
            <button type="button" class="btn btn-fantasma btn-chico" onclick={() => (usarManual = true)}>Prefiero cargarla a mano</button>
          {:else}
            <button type="button" class="btn" onclick={consultar}><Icono nombre="refrescar" /> Consultar la tasa en internet</button>
            <button type="button" class="btn btn-fantasma btn-chico" onclick={() => (usarManual = true)}>Cargarla a mano</button>
          {/if}
        {/if}
        {#if usarManual}
          {#if errorConsulta}<div class="alerta alerta-aviso">{errorConsulta}</div>{/if}
          <div class="rejilla">
            <label class="campo">
              <span>Tasa (Bs por dólar)</span>
              <input bind:value={valorManual} inputmode="decimal" placeholder="Ej.: 889,5754" class="num" />
            </label>
            <label class="campo">
              <span>Fecha valor</span>
              <input type="date" bind:value={fechaManual} />
            </label>
          </div>
          {#if navigator.onLine}
            <button type="button" class="btn btn-fantasma btn-chico" onclick={() => { usarManual = false; void consultar(); }}>Intentar por internet</button>
          {/if}
        {/if}
        {@render pie('Terminar', guardando)}
      </form>
    {/if}
  </div>
</div>

{#snippet pie(texto = 'Siguiente', ocupado = false)}
  {#if error}<div class="alerta alerta-peligro">{error}</div>{/if}
  <div class="fila-separada">
    {#if paso > 0}
      <button type="button" class="btn" onclick={() => { paso--; error = ''; }}>Atrás</button>
    {:else}
      <span></span>
    {/if}
    <button type="submit" class="btn btn-primario" disabled={ocupado}>{ocupado ? 'Guardando…' : texto}</button>
  </div>
{/snippet}

<style>
  .fondo {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .caja {
    width: min(560px, 100%);
    padding: 1.5rem;
  }

  .marca {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--primario);
    font-size: 1.35rem;
  }

  .marca strong {
    color: var(--texto);
  }

  .pasos {
    display: flex;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
    margin: 0;
    flex-wrap: wrap;
  }

  .pasos li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--texto-suave);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .pasos li + li::before {
    content: '';
    width: 16px;
    height: 1px;
    background: var(--borde);
    margin-right: 0.1rem;
  }

  .numero {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--borde);
    font-size: 0.8rem;
  }

  .actual {
    color: var(--texto) !important;
  }

  .actual .numero,
  .hecho .numero {
    background: var(--primario);
    border-color: var(--primario);
    color: var(--sobre-primario);
  }

  .centro {
    align-items: center;
    text-align: center;
  }

  .tasa-encontrada {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    border-radius: var(--radio);
    background: var(--primario-suave);
  }

  .tasa-encontrada strong {
    font-size: 1.6rem;
  }
</style>
