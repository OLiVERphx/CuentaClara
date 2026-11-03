<script lang="ts">
  import { guardarNegocio, NEGOCIO_PREDETERMINADO, PASOS_REDONDEO } from '../../../core/config/config';
  import { ESCALA, formatearDecimal, parsearDecimal } from '../../../core/dinero/dinero';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { app } from '../../estado.svelte';

  const inicial = app.negocio ?? NEGOCIO_PREDETERMINADO;
  let cfg = $state({ ...inicial });
  let ajusteTexto = $state(formatearDecimal(inicial.ajusteTasa, ESCALA.centesimas));
  let guardando = $state(false);

  const ajuste = $derived(ajusteTexto.trim() === '' ? 0 : parsearDecimal(ajusteTexto, ESCALA.centesimas));

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    if (ajuste === null) return;
    guardando = true;
    try {
      app.negocio = await guardarNegocio({ ...cfg, ajusteTasa: ajuste, minutosBloqueo: Number(cfg.minutosBloqueo), diasAlertaTasa: Number(cfg.diasAlertaTasa) });
      avisar('Configuración guardada.');
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }
</script>

<form class="pila" onsubmit={guardar}>
  <div class="tarjeta pila">
    <h2>Datos del negocio</h2>
    <label class="campo">
      <span>Nombre *</span>
      <input bind:value={cfg.nombre} maxlength="80" />
    </label>
    <div class="rejilla">
      <label class="campo">
        <span>RIF</span>
        <input bind:value={cfg.rif} />
      </label>
      <label class="campo">
        <span>Teléfono</span>
        <input bind:value={cfg.telefono} inputmode="tel" />
      </label>
    </div>
    <label class="campo">
      <span>Dirección</span>
      <input bind:value={cfg.direccion} />
    </label>
  </div>

  <div class="tarjeta pila">
    <h2>Precios en bolívares</h2>
    <div class="rejilla">
      <label class="campo">
        <span>Redondeo de precios en Bs</span>
        <select bind:value={cfg.pasoRedondeoBs}>
          {#each PASOS_REDONDEO as p}
            <option value={p.valor}>{p.nombre}</option>
          {/each}
        </select>
      </label>
      <label class="campo">
        <span>Dirección del redondeo</span>
        <select bind:value={cfg.modoRedondeo}>
          <option value="cercano">Al más cercano</option>
          <option value="arriba">Siempre hacia arriba</option>
          <option value="abajo">Siempre hacia abajo</option>
        </select>
      </label>
      <label class="campo">
        <span>Ajuste sobre la tasa BCV (%)</span>
        <input bind:value={ajusteTexto} inputmode="decimal" class="num" aria-invalid={ajuste === null} />
      </label>
    </div>
    <p class="ayuda">
      El precio en Bs de cada producto se redondea a este paso, y el total de una venta es la suma de esos precios: el cliente paga
      exactamente lo que ve. Los precios fijos en Bs no se redondean. El ajuste sobre la tasa es opcional; con 0 % se usa la tasa oficial
      tal cual.
    </p>
  </div>

  <div class="tarjeta pila">
    <h2>Operación</h2>
    <label class="casilla">
      <input type="checkbox" bind:checked={cfg.permitirStockNegativo} />
      Permitir vender aunque el sistema marque el producto agotado (queda registrado)
    </label>
    <div class="rejilla">
      <label class="campo">
        <span>Bloquear tras (minutos sin uso)</span>
        <input type="number" min="1" max="240" bind:value={cfg.minutosBloqueo} />
      </label>
      <label class="campo">
        <span>Avisar si la tasa tiene más de (días)</span>
        <input type="number" min="1" max="30" bind:value={cfg.diasAlertaTasa} />
      </label>
    </div>
  </div>

  <div>
    <button class="btn btn-primario" disabled={guardando || ajuste === null}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
  </div>
</form>

<style>
  input[type='number'] {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    background: var(--superficie);
    color: var(--texto);
    font: inherit;
  }
</style>
