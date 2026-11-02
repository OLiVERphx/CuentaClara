<script lang="ts">
  import { NOMBRE_ROL } from '../../../core/auth/permisos';
  import { pinValido } from '../../../core/auth/pin';
  import { cambiarPin } from '../../../core/auth/usuarios';
  import { guardarDispositivo } from '../../../core/config/config';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { app } from '../../estado.svelte';

  let actual = $state('');
  let nuevo = $state('');
  let confirmacion = $state('');
  let cambiando = $state(false);

  let equipo = $state({ nombre: app.dispositivo?.nombre ?? '', prefijo: app.dispositivo?.prefijo ?? '' });

  const errorPin = $derived(
    nuevo && !pinValido(nuevo) ? 'Debe tener entre 4 y 6 dígitos.' : confirmacion && confirmacion !== nuevo ? 'No coincide.' : '',
  );

  async function guardarPin(e: SubmitEvent) {
    e.preventDefault();
    if (!app.usuario || errorPin || !nuevo || confirmacion !== nuevo) return;
    cambiando = true;
    try {
      await cambiarPin(app.usuario.id, actual, nuevo);
      avisar('PIN cambiado.');
      actual = nuevo = confirmacion = '';
    } catch (err) {
      avisarError(err);
    } finally {
      cambiando = false;
    }
  }

  async function guardarEquipo(e: SubmitEvent) {
    e.preventDefault();
    if (!app.dispositivo) return;
    try {
      const datos = { ...app.dispositivo, nombre: equipo.nombre, prefijo: equipo.prefijo };
      await guardarDispositivo(datos);
      app.dispositivo = { ...datos, prefijo: datos.prefijo.trim().toUpperCase() };
      avisar('Datos del equipo guardados.');
    } catch (err) {
      avisarError(err);
    }
  }
</script>

<div class="pila">
  <form class="tarjeta pila" onsubmit={guardarPin}>
    <h2>Cambiar mi PIN</h2>
    <p class="ayuda">Usuario: {app.usuario?.nombre} ({app.usuario ? NOMBRE_ROL[app.usuario.rol] : ''})</p>
    <div class="rejilla">
      <label class="campo">
        <span>PIN actual</span>
        <input type="password" inputmode="numeric" autocomplete="current-password" maxlength="6" bind:value={actual} />
      </label>
      <label class="campo">
        <span>PIN nuevo</span>
        <input type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" bind:value={nuevo} />
      </label>
      <label class="campo">
        <span>Repite el PIN nuevo</span>
        <input type="password" inputmode="numeric" autocomplete="new-password" maxlength="6" bind:value={confirmacion} />
      </label>
    </div>
    {#if errorPin}<p class="ayuda" style:color="var(--peligro)">{errorPin}</p>{/if}
    <div>
      <button class="btn btn-primario" disabled={cambiando || !actual || !nuevo || !!errorPin || confirmacion !== nuevo}>Cambiar PIN</button>
    </div>
  </form>

  <form class="tarjeta pila" onsubmit={guardarEquipo}>
    <h2>Este equipo</h2>
    <div class="rejilla">
      <label class="campo">
        <span>Nombre</span>
        <input bind:value={equipo.nombre} maxlength="30" />
      </label>
      <label class="campo">
        <span>Prefijo de documentos</span>
        <input bind:value={equipo.prefijo} maxlength="2" class="mono" />
      </label>
    </div>
    <p class="ayuda">Identificador interno: <span class="mono">{app.dispositivo?.id}</span></p>
    <div><button class="btn">Guardar equipo</button></div>
  </form>

  <div class="tarjeta pila-chica">
    <h2>Cómo se protegen tus datos</h2>
    <ul class="ayuda">
      <li>Los datos se guardan solo en este equipo; no viajan a ningún servidor.</li>
      <li>El PIN se guarda cifrado (con hash) y tras 5 intentos fallidos la app obliga a esperar.</li>
      <li>La app se bloquea sola tras {app.negocio?.minutosBloqueo} minutos sin uso.</li>
      <li>El PIN protege el uso diario, pero no a alguien con conocimientos técnicos que tenga el equipo en la mano: protege también tu cuenta de Windows con contraseña.</li>
    </ul>
  </div>
</div>
