<script lang="ts">
  import { onMount } from 'svelte';
  import type { Tasa } from '../../../core/db/tipos';
  import { ESCALA, formatearTasa, parsearDecimal } from '../../../core/dinero/dinero';
  import { antiguedadEnDias } from '../../../core/tasa/logica';
  import { historialTasas, registrarTasaManual } from '../../../core/tasa/servicio';
  import { formatearFecha, formatearFechaHora, hoyLocal } from '../../../core/util/fechas';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import Icono from '../../../ui/Icono.svelte';
  import { app, consultarTasaEnLinea, puede, tasaDelDia, tasaVieja } from '../../estado.svelte';

  let historial = $state<Tasa[]>([]);
  let fecha = $state(hoyLocal());
  let valor = $state('');
  let guardando = $state(false);

  async function cargarHistorial() {
    historial = await historialTasas(30);
  }

  onMount(cargarHistorial);

  async function consultar() {
    const ok = await consultarTasaEnLinea();
    if (ok) avisar('Tasa actualizada desde internet.');
    await cargarHistorial();
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    const tasa = parsearDecimal(valor, ESCALA.tasa);
    if (!tasa) return;
    guardando = true;
    try {
      await registrarTasaManual(fecha, tasa);
      avisar(`Tasa ${formatearTasa(tasa)} guardada para el ${formatearFecha(fecha)}.`);
      valor = '';
      await cargarHistorial();
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }

  const aplicada = $derived(tasaDelDia());
  const valorLeido = $derived(parsearDecimal(valor, ESCALA.tasa));
</script>

<div class="pila">
  <div class="tarjeta pila">
    <div class="fila-separada">
      <h2>Tasa vigente</h2>
      <button class="btn btn-chico" onclick={consultar} disabled={app.consultandoTasa || !app.enLinea}>
        <Icono nombre="refrescar" tamano={16} />
        {app.consultandoTasa ? 'Consultando…' : 'Consultar ahora'}
      </button>
    </div>
    {#if app.tasa}
      <div class="vigente">
        <strong class="num grande">{formatearTasa(app.tasa.valor)}</strong>
        <span class="suave">Bs por dólar · fecha valor {formatearFecha(app.tasa.fechaValor)} · {app.tasa.fuente === 'auto' ? 'automática' : 'cargada a mano'}</span>
        {#if aplicada !== null && aplicada !== app.tasa.valor}
          <span class="chip chip-primario num">Con el ajuste del negocio: {formatearTasa(aplicada)}</span>
        {/if}
      </div>
      {#if tasaVieja()}
        <div class="alerta alerta-aviso">
          <Icono nombre="alerta" />
          <span>La tasa tiene {antiguedadEnDias(app.tasa, app.hoy)} días. Consúltala o cárgala a mano para no vender con precios viejos.</span>
        </div>
      {/if}
    {:else}
      <div class="alerta alerta-peligro">No hay tasa vigente. Cárgala para ver los precios en bolívares.</div>
    {/if}
    {#if app.tasaProxima}
      <div class="alerta alerta-info">
        Ya está publicada la tasa del {formatearFecha(app.tasaProxima.fechaValor)}: <strong class="num">{formatearTasa(app.tasaProxima.valor)}</strong>. Se aplicará sola ese día.
      </div>
    {/if}
    {#if app.errorTasa}
      <p class="ayuda">Última consulta automática: {app.errorTasa}</p>
    {/if}
    <p class="ayuda">Con internet, la app consulta la tasa oficial del BCV (vía DolarApi) al abrirse y cada 30 minutos.</p>
  </div>

  {#if puede('tasa.editar')}
    <form class="tarjeta pila" onsubmit={guardar}>
      <h2>Cargar a mano</h2>
      <p class="ayuda">Úsalo si no hay internet o si la tasa automática no coincide con la del BCV. Una carga manual reemplaza a la automática de esa misma fecha.</p>
      <div class="rejilla">
        <label class="campo">
          <span>Tasa (Bs por dólar)</span>
          <input bind:value={valor} inputmode="decimal" placeholder="889,5754" class="num" aria-invalid={valor !== '' && !valorLeido} />
        </label>
        <label class="campo">
          <span>Fecha valor</span>
          <input type="date" bind:value={fecha} />
        </label>
      </div>
      {#if valorLeido}
        <p class="ayuda">Se guardará como <strong class="num">{formatearTasa(valorLeido)}</strong> Bs/USD.</p>
      {/if}
      <div>
        <button class="btn btn-primario" disabled={guardando || !valorLeido}>Guardar tasa</button>
      </div>
    </form>
  {/if}

  <div class="pila-chica">
    <h2>Historial</h2>
    {#if historial.length === 0}
      <p class="vacio">Sin tasas registradas.</p>
    {:else}
      <div class="tabla-contenedor">
        <table>
          <thead>
            <tr><th>Fecha valor</th><th class="derecha">Bs/USD</th><th>Origen</th><th>Registrada</th></tr>
          </thead>
          <tbody>
            {#each historial as t (t.id)}
              <tr>
                <td>{formatearFecha(t.fechaValor)}</td>
                <td class="derecha num">{formatearTasa(t.valor)}</td>
                <td><span class="chip" class:chip-primario={t.fuente === 'manual'}>{t.fuente === 'auto' ? 'Automática' : 'Manual'}</span></td>
                <td class="suave">{formatearFechaHora(t.actualizadoEn)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .vigente {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .grande {
    font-size: 2rem;
  }
</style>
