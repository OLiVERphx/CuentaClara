<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ESCALA, formatearBs, formatearParaEditar, formatearTasa, formatearUsd, parsearDecimal, type Redondeo, type Tasa4 } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO, ORDEN_METODOS, type MetodoPago } from '../../../core/pagos';
  import Icono from '../../../ui/Icono.svelte';
  import { estadoCobro, monedaDe, montoSugerido, type PagoTicket, type Totales } from '../calculos';

  let {
    totales,
    tasa,
    redondeo,
    onConfirmar,
    onCerrar,
  }: {
    totales: Totales;
    tasa: Tasa4;
    redondeo: Redondeo;
    onConfirmar: (pagos: PagoTicket[]) => Promise<boolean>;
    onCerrar: () => void;
  } = $props();

  interface LineaPago {
    id: number;
    metodo: MetodoPago;
    texto: string;
    esVuelto: boolean;
    referencia: string;
    banco: string;
  }

  let dialogo: HTMLDialogElement;
  let lineas = $state<LineaPago[]>([]);
  let siguienteId = 1;
  let confirmando = $state(false);

  const pagos = $derived(
    lineas.map((l) => ({
      metodo: l.metodo,
      monto: parsearDecimal(l.texto, ESCALA.centavos) ?? 0,
      esVuelto: l.esVuelto,
      referencia: l.referencia,
      banco: l.banco,
    })),
  );
  const invalidas = $derived(lineas.filter((l) => l.texto.trim() !== '' && parsearDecimal(l.texto, ESCALA.centavos) === null).length);
  const estado = $derived(estadoCobro(totales, pagos.filter((p) => p.monto > 0), tasa, redondeo.paso));
  const listo = $derived(estado.cuadrado && invalidas === 0 && !confirmando);

  onMount(() => {
    dialogo.showModal();
  });

  async function agregar(metodo: MetodoPago, esVuelto = false) {
    const monto = montoSugerido(metodo, estado, esVuelto, redondeo);
    const id = siguienteId++;
    lineas.push({ id, metodo, esVuelto, texto: monto > 0 ? formatearParaEditar(monto, ESCALA.centavos) : '', referencia: '', banco: '' });
    await tick();
    const campo = dialogo.querySelector<HTMLInputElement>(`[data-monto="${id}"]`);
    campo?.focus();
    campo?.select();
  }

  async function confirmar() {
    if (!listo) return;
    confirmando = true;
    const ok = await onConfirmar(pagos.filter((p) => p.monto > 0));
    confirmando = false;
    if (ok) dialogo.close();
  }

  function alTeclearMonto(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmar();
    }
  }
</script>

<dialog bind:this={dialogo} class="cobro" onclose={onCerrar} aria-labelledby="titulo-cobro">
  <header class="cabecera">
    <div>
      <h2 id="titulo-cobro">Cobrar</h2>
      <p class="ayuda">Tasa {formatearTasa(tasa)} Bs/USD</p>
    </div>
    <div class="totales">
      <strong class="num total-bs">{formatearBs(totales.totalBs)}</strong>
      <span class="num total-usd">{formatearUsd(totales.totalUsd)}</span>
    </div>
  </header>

  <div class="cuerpo">
    <div class="pila-chica">
      <span class="etiqueta">Agregar pago</span>
      <div class="metodos">
        {#each ORDEN_METODOS as metodo}
          <button type="button" class="btn metodo" onclick={() => agregar(metodo)}>
            {METODOS_PAGO[metodo].nombre}
          </button>
        {/each}
      </div>
    </div>

    {#if lineas.length > 0}
      <ul class="lineas">
        {#each lineas as l, i (l.id)}
          {@const moneda = monedaDe(l.metodo)}
          <li class:vuelto={l.esVuelto}>
            <div class="nombre-linea">
              {#if l.esVuelto}<span class="chip chip-bajo">Vuelto</span>{/if}
              <strong>{METODOS_PAGO[l.metodo].nombre}</strong>
            </div>
            <label class="campo monto">
              <span class="oculto-visual">Monto en {moneda === 'USD' ? 'dólares' : 'bolívares'}</span>
              <div class="con-moneda">
                <span class="suave">{moneda === 'USD' ? '$' : 'Bs'}</span>
                <input
                  bind:value={l.texto}
                  data-monto={l.id}
                  inputmode="decimal"
                  class="num"
                  onkeydown={alTeclearMonto}
                  aria-invalid={l.texto !== '' && parsearDecimal(l.texto, ESCALA.centavos) === null}
                />
              </div>
            </label>
            {#if METODOS_PAGO[l.metodo].referencia && !l.esVuelto}
              <input class="referencia" bind:value={l.referencia} placeholder="Referencia" aria-label="Referencia" inputmode="numeric" maxlength="20" />
            {/if}
            {#if l.metodo === 'pago_movil'}
              <input class="referencia" bind:value={l.banco} placeholder="Banco" aria-label="Banco" maxlength="30" />
            {/if}
            <button type="button" class="btn btn-fantasma btn-chico" aria-label="Quitar" onclick={() => lineas.splice(i, 1)}>
              <Icono nombre="cerrar" tamano={18} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if estado.cuadrado && lineas.length > 0}
      <div class="estado estado-ok"><Icono nombre="check" /> Pago completo</div>
    {:else if estado.faltanteBs > 0}
      <div class="estado estado-falta">
        <span>Falta</span>
        <strong class="num">{formatearBs(estado.faltanteBs)}</strong>
        <span class="num suave">{formatearUsd(estado.faltanteUsd)}</span>
      </div>
    {:else if estado.sobranteBs > 0}
      <div class="pila-chica">
        <div class="estado estado-vuelto">
          <span>Vuelto</span>
          <strong class="num">{formatearBs(estado.sobranteBs)}</strong>
          <span class="num">{formatearUsd(estado.sobranteUsd)}</span>
        </div>
        <div class="metodos">
          <button type="button" class="btn" onclick={() => agregar('efectivo_bs', true)}>Vuelto en efectivo Bs</button>
          <button type="button" class="btn" onclick={() => agregar('efectivo_usd', true)}>Vuelto en $</button>
          <button type="button" class="btn" onclick={() => agregar('pago_movil', true)}>Vuelto por pago móvil</button>
        </div>
      </div>
    {/if}

    {#if lineas.some((l) => l.esVuelto) && estado.cuadrado}
      <p class="ayuda">
        Entregar:
        {#each lineas.filter((l) => l.esVuelto) as l, i}
          {i > 0 ? ' + ' : ''}<strong class="num">{formatearMonto(parsearDecimal(l.texto, ESCALA.centavos) ?? 0, monedaDe(l.metodo))}</strong> ({METODOS_PAGO[l.metodo].nombre})
        {/each}
      </p>
    {/if}
  </div>

  <footer class="pie">
    <button type="button" class="btn" onclick={() => dialogo.close()}>Cancelar <kbd>Esc</kbd></button>
    <button type="button" class="btn btn-primario btn-grande" disabled={!listo} onclick={confirmar}>
      {confirmando ? 'Registrando…' : 'Registrar venta'} <kbd>Enter</kbd>
    </button>
  </footer>
</dialog>

<style>
  .cobro {
    width: min(680px, calc(100vw - 1.5rem));
    max-height: calc(100vh - 1.5rem);
    padding: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    background: var(--superficie);
    color: var(--texto);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
  }

  .cobro[open] {
    display: flex;
    flex-direction: column;
  }

  .cobro::backdrop {
    background: rgb(10 15 20 / 0.6);
  }

  .cabecera {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--borde);
  }

  .totales {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .total-bs {
    font-size: 1.9rem;
    color: var(--primario);
    line-height: 1.1;
  }

  .total-usd {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .cuerpo {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow-y: auto;
  }

  .metodos {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .metodo {
    flex: 1 1 120px;
  }

  .lineas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .lineas li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
  }

  .lineas li.vuelto {
    background: var(--aviso-suave);
  }

  .nombre-linea {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 130px;
  }

  .monto {
    width: 170px;
  }

  .con-moneda {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .con-moneda input {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .referencia {
    width: 120px !important;
  }

  .estado {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-radius: var(--radio-chico);
    font-weight: 600;
  }

  .estado strong {
    font-size: 1.4rem;
  }

  .estado-ok {
    align-items: center;
    background: var(--exito-suave);
    color: var(--exito);
  }

  .estado-falta {
    background: var(--peligro-suave);
    color: var(--peligro);
  }

  .estado-vuelto {
    background: var(--aviso-suave);
    color: var(--aviso);
  }

  .pie {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.9rem 1.25rem;
    border-top: 1px solid var(--borde);
    background: var(--superficie-2);
  }

  kbd {
    font-family: var(--mono);
    font-size: 0.72rem;
    padding: 0.05rem 0.35rem;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.7;
  }
</style>
