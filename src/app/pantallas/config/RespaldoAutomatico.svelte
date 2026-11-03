<script lang="ts">
  import { onMount } from 'svelte';
  import {
    configurarRespaldoAuto,
    ejecutarRespaldoAutomatico,
    leerRespaldoAuto,
    prepararPermiso,
    puedeElegirCarpeta,
    type Carpeta,
    type ConfigRespaldoAuto,
  } from '../../../core/respaldo/automatico';
  import { LARGO_MINIMO_CONTRASENA } from '../../../core/respaldo/respaldo';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import { descargarArchivo } from '../../../ui/descargar';
  import Icono from '../../../ui/Icono.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';

  let cfg = $state<ConfigRespaldoAuto | null>(null);
  let cambiandoClave = $state(false);
  let clave = $state('');
  let clave2 = $state('');
  let ocupado = $state(false);

  onMount(async () => {
    cfg = await leerRespaldoAuto();
    cambiandoClave = !cfg.contrasena;
  });

  const claveValida = $derived(clave.length >= LARGO_MINIMO_CONTRASENA && clave === clave2);

  async function activar() {
    if (!cfg) return;
    try {
      cfg = await configurarRespaldoAuto({ activo: true, ...(cambiandoClave ? { contrasena: clave } : {}) });
      cambiandoClave = false;
      clave = clave2 = '';
      avisar('Respaldo automático activado: se hará cada vez que cierres la caja.');
    } catch (e) {
      avisarError(e);
    }
  }

  async function desactivar() {
    cfg = await configurarRespaldoAuto({ activo: false });
    avisar('Respaldo automático desactivado.', 'info');
  }

  async function elegirCarpeta() {
    try {
      const carpeta = await (window as unknown as { showDirectoryPicker(o: object): Promise<Carpeta> }).showDirectoryPicker({
        id: 'respaldos-bodega',
        mode: 'readwrite',
      });
      cfg = await configurarRespaldoAuto({ carpeta });
      avisar(`Los respaldos se guardarán en «${carpeta.name}».`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      avisarError(e);
    }
  }

  async function probar() {
    ocupado = true;
    await prepararPermiso();
    const r = await ejecutarRespaldoAutomatico();
    ocupado = false;
    if (r.estado === 'guardado') avisar(`Respaldo guardado en «${r.carpeta}» (${r.nombre}).`);
    else if (r.estado === 'descargar') {
      descargarArchivo(r.archivo, r.nombre);
      avisar('Respaldo descargado. Guárdalo fuera del equipo.');
    } else if (r.estado === 'error') avisar(r.mensaje, 'error', 7000);
    cfg = await leerRespaldoAuto();
  }
</script>

{#if cfg}
  <div class="tarjeta pila">
    <div class="fila-separada">
      <div class="fila"><Icono nombre="refrescar" /><h2>Respaldo automático al cerrar la caja</h2></div>
      {#if cfg.activo}<span class="chip chip-normal">Activo</span>{:else}<span class="chip">Apagado</span>{/if}
    </div>
    <p>
      Cada vez que cierres la caja se crea un respaldo cifrado. Así nunca dependes de acordarte.
      {#if cfg.ultimo}<br /><span class="ayuda">Último respaldo automático: {formatearFechaHora(cfg.ultimo)}.</span>{/if}
    </p>

    <div class="pila-chica">
      <span class="etiqueta">Dónde se guarda</span>
      {#if cfg.carpeta}
        <div class="fila"><strong>Carpeta «{cfg.carpeta.name}»</strong>
          {#if puedeElegirCarpeta()}<button class="btn btn-chico" onclick={elegirCarpeta}>Cambiar</button>{/if}
        </div>
      {:else if puedeElegirCarpeta()}
        <div class="fila">
          <span class="suave">Sin carpeta: el archivo se descargará.</span>
          <button class="btn btn-chico" onclick={elegirCarpeta}>Elegir carpeta (por ejemplo, un pendrive)</button>
        </div>
      {:else}
        <span class="suave">Este navegador no permite elegir carpeta: el archivo se descargará en cada cierre.</span>
      {/if}
    </div>

    {#if cambiandoClave || !cfg.activo}
      {#if cambiandoClave}
        <div class="rejilla">
          <label class="campo">
            <span>Contraseña de los respaldos</span>
            <input type="password" autocomplete="new-password" bind:value={clave} />
          </label>
          <label class="campo">
            <span>Repite la contraseña</span>
            <input type="password" autocomplete="new-password" bind:value={clave2} aria-invalid={!!clave2 && clave2 !== clave} />
          </label>
        </div>
        <div class="alerta alerta-aviso">
          <Icono nombre="alerta" />
          <span>
            Mínimo {LARGO_MINIMO_CONTRASENA} caracteres; anótala. Queda guardada en este equipo para cifrar sin preguntarte: protege la copia que
            sale del equipo (el pendrive), y nunca viaja dentro del respaldo.
          </span>
        </div>
      {/if}
      <div>
        <button class="btn btn-primario" disabled={cambiandoClave && !claveValida} onclick={activar}>Activar respaldo automático</button>
      </div>
    {:else}
      <div class="fila">
        <button class="btn" onclick={probar} disabled={ocupado}>{ocupado ? 'Respaldando…' : 'Respaldar ahora'}</button>
        <button class="btn btn-fantasma btn-chico" onclick={() => (cambiandoClave = true)}>Cambiar contraseña</button>
        <button class="btn btn-fantasma btn-chico" onclick={desactivar}>Desactivar</button>
      </div>
    {/if}
  </div>
{/if}
