<script lang="ts">
  import {
    crearRespaldo,
    EXTENSION_RESPALDO,
    LARGO_MINIMO_CONTRASENA,
    leerRespaldo,
    restaurarRespaldo,
    resumirRespaldo,
    type ContenidoRespaldo,
  } from '../../../core/respaldo/respaldo';
  import { formatearFechaHora, hoyLocal } from '../../../core/util/fechas';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { descargarArchivo } from '../../../ui/descargar';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';

  const NOMBRES_TABLA: Record<string, string> = {
    productos: 'Productos',
    presentaciones: 'Presentaciones',
    categorias: 'Categorías',
    movimientosInventario: 'Movimientos de inventario',
    tasas: 'Tasas',
    usuarios: 'Usuarios',
    auditoria: 'Registro de auditoría',
  };

  let contrasena = $state('');
  let confirmacion = $state('');
  let creando = $state(false);

  let archivo = $state<File | null>(null);
  let contrasenaRestaurar = $state('');
  let leyendo = $state(false);
  let contenido = $state<ContenidoRespaldo | null>(null);
  let confirmarAbierto = $state(false);
  let restaurando = $state(false);

  async function exportar(e: SubmitEvent) {
    e.preventDefault();
    if (contrasena !== confirmacion) return;
    creando = true;
    try {
      const blob = await crearRespaldo(contrasena);
      const hora = new Date().toTimeString().slice(0, 5).replace(':', '');
      descargarArchivo(blob, `respaldo-bodega-${hoyLocal()}-${hora}${EXTENSION_RESPALDO}`);
      avisar('Respaldo creado. Guárdalo fuera de este equipo (pendrive, correo o nube).', 'exito', 6000);
      contrasena = confirmacion = '';
    } catch (err) {
      avisarError(err);
    } finally {
      creando = false;
    }
  }

  async function leer(e: SubmitEvent) {
    e.preventDefault();
    if (!archivo) return;
    leyendo = true;
    try {
      contenido = await leerRespaldo(archivo, contrasenaRestaurar);
      confirmarAbierto = true;
    } catch (err) {
      avisarError(err);
    } finally {
      leyendo = false;
    }
  }

  async function restaurar() {
    if (!contenido) return;
    restaurando = true;
    try {
      await restaurarRespaldo(contenido);
      // La app se recarga sola al terminar (evento datos.restaurados).
    } catch (err) {
      avisarError(err);
      restaurando = false;
    }
  }
</script>

<div class="pila">
  <form class="tarjeta pila" onsubmit={exportar}>
    <div class="fila"><Icono nombre="bajar" /><h2>Crear respaldo</h2></div>
    <p>
      Descarga un archivo cifrado con todos los datos. Hazlo seguido y guárdalo fuera de este equipo: si la laptop se daña o se borran los
      datos del navegador, el respaldo es lo único que los recupera.
    </p>
    <div class="rejilla">
      <label class="campo">
        <span>Contraseña del respaldo</span>
        <input type="password" autocomplete="new-password" bind:value={contrasena} />
      </label>
      <label class="campo">
        <span>Repite la contraseña</span>
        <input type="password" autocomplete="new-password" bind:value={confirmacion} aria-invalid={!!confirmacion && confirmacion !== contrasena} />
      </label>
    </div>
    <div class="alerta alerta-aviso">
      <Icono nombre="alerta" />
      <span>Mínimo {LARGO_MINIMO_CONTRASENA} caracteres. Anótala en un lugar seguro: sin ella nadie puede abrir el respaldo.</span>
    </div>
    <div>
      <button class="btn btn-primario" disabled={creando || contrasena.length < LARGO_MINIMO_CONTRASENA || contrasena !== confirmacion}>
        {creando ? 'Creando…' : 'Descargar respaldo'}
      </button>
    </div>
  </form>

  <form class="tarjeta pila" onsubmit={leer}>
    <div class="fila"><Icono nombre="subir" /><h2>Restaurar un respaldo</h2></div>
    <p>Reemplaza <strong>todos</strong> los datos de este equipo por los del archivo.</p>
    <div class="rejilla">
      <label class="campo">
        <span>Archivo {EXTENSION_RESPALDO}</span>
        <input type="file" accept={EXTENSION_RESPALDO} onchange={(e) => (archivo = e.currentTarget.files?.[0] ?? null)} />
      </label>
      <label class="campo">
        <span>Contraseña del respaldo</span>
        <input type="password" autocomplete="off" bind:value={contrasenaRestaurar} />
      </label>
    </div>
    <div>
      <button class="btn" disabled={leyendo || !archivo || !contrasenaRestaurar}>{leyendo ? 'Abriendo…' : 'Abrir respaldo'}</button>
    </div>
  </form>
</div>

<Modal bind:abierto={confirmarAbierto} titulo="¿Restaurar este respaldo?">
  {#if contenido}
    <p>Creado el <strong>{formatearFechaHora(contenido.creadoEn)}</strong>. Contiene:</p>
    <ul>
      {#each Object.entries(resumirRespaldo(contenido)).filter(([t]) => NOMBRES_TABLA[t]) as [tabla, cantidad]}
        <li>{NOMBRES_TABLA[tabla]}: <strong class="num">{cantidad}</strong></li>
      {/each}
    </ul>
    <div class="alerta alerta-peligro">
      Los datos actuales de este equipo se reemplazarán y no se pueden recuperar. Si tienes dudas, crea primero un respaldo de lo actual.
      Los usuarios y PIN pasan a ser los del respaldo.
    </div>
  {/if}
  {#snippet acciones()}
    <button class="btn" onclick={() => (confirmarAbierto = false)} disabled={restaurando}>Cancelar</button>
    <button class="btn btn-peligro" onclick={restaurar} disabled={restaurando}>{restaurando ? 'Restaurando…' : 'Sí, restaurar'}</button>
  {/snippet}
</Modal>
