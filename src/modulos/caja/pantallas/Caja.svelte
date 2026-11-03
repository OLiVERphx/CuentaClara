<script lang="ts">
  import { puede } from '../../../app/estado.svelte';
  import { ESCALA, formatearBs, formatearUsd, parsearDecimal } from '../../../core/dinero/dinero';
  import { formatearMonto, METODOS_PAGO, ORDEN_METODOS, type MetodoPago } from '../../../core/pagos';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../almacen.svelte';
  import { resumirCaja } from '../calculos';
  import { movimientosDeSesion, sesionesRecientes } from '../consultas';
  import { abrirCaja, cerrarCaja, registrarGasto, registrarMovimientoManual } from '../servicio';
  import { CATEGORIAS_GASTO, TIPOS_MOVIMIENTO_CAJA, type CategoriaGasto, type MovimientoCaja, type SesionCaja } from '../tipos';

  let movimientos = $state<MovimientoCaja[]>([]);
  let historial = $state<SesionCaja[]>([]);
  let procesando = $state(false);

  $effect(() => {
    void caja.version;
    const sesion = caja.sesion;
    if (sesion) void movimientosDeSesion(sesion.id).then((m) => (movimientos = m));
    else movimientos = [];
    void sesionesRecientes(15).then((s) => (historial = s.filter((x) => x.estado === 'cerrada')));
  });

  const resumen = $derived(caja.sesion ? resumirCaja(caja.sesion, movimientos) : null);
  const conActividad = $derived(resumen?.porMetodo.filter((t) => t.entradas !== 0 || t.salidas !== 0 || METODOS_PAGO[t.metodo].efectivo) ?? []);

  const leerBs = (t: string) => (t.trim() === '' ? 0 : parsearDecimal(t, ESCALA.centimos));
  const leerUsd = (t: string) => (t.trim() === '' ? 0 : parsearDecimal(t, ESCALA.centavos));

  // ── Apertura ──
  let fondoBs = $state('');
  let fondoUsd = $state('');

  async function abrir(e: SubmitEvent) {
    e.preventDefault();
    const bs = leerBs(fondoBs);
    const usd = leerUsd(fondoUsd);
    if (bs === null || usd === null) return;
    procesando = true;
    try {
      await abrirCaja({ fondoBs: bs, fondoUsd: usd });
      avisar('Caja abierta. ¡Buenas ventas!');
      fondoBs = fondoUsd = '';
    } catch (err) {
      avisarError(err);
    } finally {
      procesando = false;
    }
  }

  // ── Gasto ──
  let gastoAbierto = $state(false);
  let gasto = $state({ categoria: 'bolsas' as CategoriaGasto, descripcion: '', metodo: 'efectivo_bs' as MetodoPago, monto: '', desdeCaja: true });
  const montoGasto = $derived(METODOS_PAGO[gasto.metodo].moneda === 'USD' ? leerUsd(gasto.monto) : leerBs(gasto.monto));

  function abrirGasto() {
    gasto = { categoria: 'bolsas', descripcion: '', metodo: 'efectivo_bs', monto: '', desdeCaja: true };
    gastoAbierto = true;
  }

  async function guardarGasto() {
    if (!montoGasto) return;
    procesando = true;
    try {
      await registrarGasto({ ...gasto, monto: montoGasto });
      avisar('Gasto registrado.');
      gastoAbierto = false;
    } catch (err) {
      avisarError(err);
    } finally {
      procesando = false;
    }
  }

  // ── Retiro / ingreso ──
  let manualAbierto = $state(false);
  let manual = $state({ tipo: 'retiro_dueno' as 'retiro_dueno' | 'ingreso_extra', metodo: 'efectivo_bs' as MetodoPago, monto: '', descripcion: '' });
  const montoManual = $derived(METODOS_PAGO[manual.metodo].moneda === 'USD' ? leerUsd(manual.monto) : leerBs(manual.monto));

  function abrirManual(tipo: 'retiro_dueno' | 'ingreso_extra') {
    manual = { tipo, metodo: 'efectivo_bs', monto: '', descripcion: '' };
    manualAbierto = true;
  }

  async function guardarManual() {
    if (!montoManual) return;
    procesando = true;
    try {
      await registrarMovimientoManual({ ...manual, monto: montoManual });
      avisar(manual.tipo === 'retiro_dueno' ? 'Retiro registrado.' : 'Ingreso registrado.');
      manualAbierto = false;
    } catch (err) {
      avisarError(err);
    } finally {
      procesando = false;
    }
  }

  // ── Cierre ──
  let cierreAbierto = $state(false);
  let contadoBs = $state('');
  let contadoUsd = $state('');
  let nota = $state('');
  const contado = $derived({ bs: leerBs(contadoBs), usd: leerUsd(contadoUsd) });

  function abrirCierre() {
    contadoBs = contadoUsd = nota = '';
    cierreAbierto = true;
  }

  async function cerrar() {
    if (contado.bs === null || contado.usd === null) return;
    procesando = true;
    try {
      const s = await cerrarCaja({ contadoBs: contado.bs, contadoUsd: contado.usd, nota });
      const difBs = s.contadoBs! - s.esperadoBs!;
      const difUsd = s.contadoUsd! - s.esperadoUsd!;
      avisar(
        difBs === 0 && difUsd === 0
          ? 'Caja cerrada. ¡Cuadró exacto!'
          : `Caja cerrada con diferencia: ${formatearBs(difBs)} y ${formatearUsd(difUsd)}.`,
        difBs === 0 && difUsd === 0 ? 'exito' : 'info',
        8000,
      );
      cierreAbierto = false;
    } catch (err) {
      avisarError(err);
    } finally {
      procesando = false;
    }
  }

  function hora(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function diferencia(contadoValor: number | null, esperado: number | null): number {
    return (contadoValor ?? 0) - (esperado ?? 0);
  }
</script>

<div class="encabezado-pagina">
  <h1>Caja</h1>
  {#if caja.sesion}
    <div class="fila">
      {#if puede('caja.gastos')}
        <button class="btn" onclick={abrirGasto}>Gasto</button>
        <button class="btn" onclick={() => abrirManual('retiro_dueno')}>Retiro</button>
        <button class="btn" onclick={() => abrirManual('ingreso_extra')}>Ingreso</button>
      {/if}
      <button class="btn btn-primario" onclick={abrirCierre}><Icono nombre="candado" /> Cerrar caja</button>
    </div>
  {/if}
</div>

{#if !caja.sesion}
  <form class="tarjeta pila apertura" onsubmit={abrir}>
    <h2>Abrir caja</h2>
    <p class="ayuda">Cuenta el efectivo con el que empiezas el día (el sencillo para dar vuelto). Si no hay, deja 0.</p>
    <div class="rejilla">
      <label class="campo">
        <span>Fondo en efectivo Bs</span>
        <input bind:value={fondoBs} inputmode="decimal" class="num" placeholder="0" aria-invalid={leerBs(fondoBs) === null} />
      </label>
      <label class="campo">
        <span>Fondo en efectivo $</span>
        <input bind:value={fondoUsd} inputmode="decimal" class="num" placeholder="0" aria-invalid={leerUsd(fondoUsd) === null} />
      </label>
    </div>
    <div>
      <button class="btn btn-primario btn-grande" disabled={procesando || leerBs(fondoBs) === null || leerUsd(fondoUsd) === null}>Abrir caja</button>
    </div>
  </form>
{:else if resumen}
  <p class="ayuda">
    Caja #{caja.sesion.numero} abierta el {formatearFechaHora(caja.sesion.abiertaEn)} por {caja.sesion.abiertaPorNombre} · fondo
    {formatearBs(caja.sesion.fondoBs)} y {formatearUsd(caja.sesion.fondoUsd)}
  </p>

  <div class="datos">
    <div class="tarjeta dato">
      <span class="suave">Cobrado en ventas</span>
      <strong class="num">{formatearBs(resumen.vendidoBs)}</strong>
      <span class="ayuda">{resumen.ventas} {resumen.ventas === 1 ? 'venta' : 'ventas'} (sin contar lo fiado)</span>
    </div>
    {#if resumen.abonosBs}
      <div class="tarjeta dato">
        <span class="suave">Abonos de fiao</span>
        <strong class="num">{formatearBs(resumen.abonosBs)}</strong>
      </div>
    {/if}
    <div class="tarjeta dato destacado">
      <span class="suave">Efectivo Bs en gaveta</span>
      <strong class="num">{formatearBs(resumen.esperadoBs)}</strong>
    </div>
    <div class="tarjeta dato destacado">
      <span class="suave">Efectivo $ en gaveta</span>
      <strong class="num">{formatearUsd(resumen.esperadoUsd)}</strong>
    </div>
    {#if resumen.gastosBs || resumen.retirosBs}
      <div class="tarjeta dato">
        <span class="suave">Gastos / retiros</span>
        <strong class="num">{formatearBs(resumen.gastosBs + resumen.retirosBs)}</strong>
      </div>
    {/if}
  </div>

  <h2 class="subtitulo">Por método de pago</h2>
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr><th>Método</th><th class="derecha">Entradas</th><th class="derecha">Salidas</th><th class="derecha">Neto</th></tr>
      </thead>
      <tbody>
        {#each conActividad as t (t.metodo)}
          <tr>
            <td>{METODOS_PAGO[t.metodo].nombre}</td>
            <td class="derecha num">{formatearMonto(t.entradas, t.moneda)}</td>
            <td class="derecha num">{t.salidas ? formatearMonto(t.salidas, t.moneda) : '—'}</td>
            <td class="derecha num"><strong>{formatearMonto(t.neto, t.moneda)}</strong></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="ayuda">Pago móvil, punto y biopago no se cuentan en la gaveta: compáralos con los movimientos del banco.</p>

  <h2 class="subtitulo">Movimientos</h2>
  {#if movimientos.length === 0}
    <p class="vacio">Sin movimientos todavía.</p>
  {:else}
    <div class="tabla-contenedor">
      <table>
        <thead>
          <tr><th>Hora</th><th>Tipo</th><th class="ocultable">Detalle</th><th>Método</th><th class="derecha">Monto</th></tr>
        </thead>
        <tbody>
          {#each [...movimientos].reverse() as m (m.id)}
            <tr>
              <td class="num">{hora(m.creadoEn)}</td>
              <td>{TIPOS_MOVIMIENTO_CAJA[m.tipo]}</td>
              <td class="ocultable suave">
                {#if m.documentoTipo === 'venta' && m.documentoId}<a href="#/ventas/{m.documentoId}">{m.descripcion}</a>{:else}{m.descripcion}{/if}
              </td>
              <td>{METODOS_PAGO[m.metodo].nombre}</td>
              <td class="derecha num" class:positivo={m.monto > 0} class:negativo={m.monto < 0}>
                {m.monto > 0 ? '+' : ''}{formatearMonto(m.monto, m.moneda)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

{#if historial.length > 0}
  <h2 class="subtitulo">Cierres anteriores</h2>
  <div class="tabla-contenedor">
    <table>
      <thead>
        <tr><th>Caja</th><th>Cerrada</th><th class="derecha">Dif. Bs</th><th class="derecha">Dif. $</th><th class="ocultable">Nota</th></tr>
      </thead>
      <tbody>
        {#each historial as s (s.id)}
          {@const difBs = diferencia(s.contadoBs, s.esperadoBs)}
          {@const difUsd = diferencia(s.contadoUsd, s.esperadoUsd)}
          <tr>
            <td class="num">#{s.numero}</td>
            <td class="suave">{s.cerradaEn ? formatearFechaHora(s.cerradaEn) : ''}</td>
            <td class="derecha num" class:negativo={difBs < 0} class:positivo={difBs > 0}>{formatearBs(difBs)}</td>
            <td class="derecha num" class:negativo={difUsd < 0} class:positivo={difUsd > 0}>{formatearUsd(difUsd)}</td>
            <td class="ocultable suave">{s.nota}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Modal bind:abierto={gastoAbierto} titulo="Registrar gasto">
  <label class="campo">
    <span>Categoría</span>
    <select bind:value={gasto.categoria}>
      {#each Object.entries(CATEGORIAS_GASTO) as [valor, nombre]}
        <option value={valor}>{nombre}</option>
      {/each}
    </select>
  </label>
  <label class="campo">
    <span>Descripción *</span>
    <input bind:value={gasto.descripcion} maxlength="120" placeholder="Paquete de bolsas" />
  </label>
  <div class="rejilla">
    <label class="campo">
      <span>Pagado con</span>
      <select bind:value={gasto.metodo} onchange={() => (gasto.desdeCaja = METODOS_PAGO[gasto.metodo].efectivo)}>
        {#each ORDEN_METODOS as m}
          <option value={m}>{METODOS_PAGO[m].nombre}</option>
        {/each}
      </select>
    </label>
    <label class="campo">
      <span>Monto ({METODOS_PAGO[gasto.metodo].moneda === 'USD' ? '$' : 'Bs'})</span>
      <input bind:value={gasto.monto} inputmode="decimal" class="num" aria-invalid={gasto.monto !== '' && !montoGasto} />
    </label>
  </div>
  <label class="casilla">
    <input type="checkbox" bind:checked={gasto.desdeCaja} />
    El dinero salió de la caja
  </label>
  {#snippet acciones()}
    <button class="btn" onclick={() => (gastoAbierto = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={procesando || !montoGasto || !gasto.descripcion.trim()} onclick={guardarGasto}>Registrar</button>
  {/snippet}
</Modal>

<Modal bind:abierto={manualAbierto} titulo={manual.tipo === 'retiro_dueno' ? 'Retiro del dueño' : 'Ingreso a la caja'}>
  <p class="ayuda">
    {manual.tipo === 'retiro_dueno'
      ? 'Dinero que sacas de la caja para uso personal. Si no lo registras, el cierre no cuadra.'
      : 'Dinero que entra a la caja sin ser una venta (por ejemplo, sencillo para dar vuelto).'}
  </p>
  <div class="rejilla">
    <label class="campo">
      <span>Método</span>
      <select bind:value={manual.metodo}>
        {#each ORDEN_METODOS as m}
          <option value={m}>{METODOS_PAGO[m].nombre}</option>
        {/each}
      </select>
    </label>
    <label class="campo">
      <span>Monto ({METODOS_PAGO[manual.metodo].moneda === 'USD' ? '$' : 'Bs'})</span>
      <input bind:value={manual.monto} inputmode="decimal" class="num" aria-invalid={manual.monto !== '' && !montoManual} />
    </label>
  </div>
  <label class="campo">
    <span>Nota</span>
    <input bind:value={manual.descripcion} maxlength="120" />
  </label>
  {#snippet acciones()}
    <button class="btn" onclick={() => (manualAbierto = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={procesando || !montoManual} onclick={guardarManual}>Registrar</button>
  {/snippet}
</Modal>

<Modal bind:abierto={cierreAbierto} titulo="Cerrar caja">
  {#if resumen}
    <p>Cuenta el efectivo de la gaveta y escríbelo. El sistema te muestra si cuadra.</p>
    <div class="rejilla">
      <label class="campo">
        <span>Efectivo Bs contado</span>
        <input bind:value={contadoBs} inputmode="decimal" class="num" aria-invalid={contado.bs === null} />
      </label>
      <label class="campo">
        <span>Efectivo $ contado</span>
        <input bind:value={contadoUsd} inputmode="decimal" class="num" aria-invalid={contado.usd === null} />
      </label>
    </div>
    <table class="arqueo">
      <tbody>
        <tr>
          <td>Esperado</td>
          <td class="derecha num">{formatearBs(resumen.esperadoBs)}</td>
          <td class="derecha num">{formatearUsd(resumen.esperadoUsd)}</td>
        </tr>
        <tr>
          <td>Diferencia</td>
          {#each [{ dif: (contado.bs ?? 0) - resumen.esperadoBs, f: formatearBs }, { dif: (contado.usd ?? 0) - resumen.esperadoUsd, f: formatearUsd }] as d}
            <td class="derecha num" class:negativo={d.dif < 0} class:positivo={d.dif > 0}>
              <strong>{d.dif === 0 ? '✓ Cuadra' : (d.dif > 0 ? 'Sobra ' : 'Falta ') + d.f(Math.abs(d.dif))}</strong>
            </td>
          {/each}
        </tr>
      </tbody>
    </table>
    <label class="campo">
      <span>Nota (opcional)</span>
      <input bind:value={nota} maxlength="200" placeholder="Explica cualquier diferencia" />
    </label>
  {/if}
  {#snippet acciones()}
    <button class="btn" onclick={() => (cierreAbierto = false)}>Cancelar</button>
    <button class="btn btn-primario" disabled={procesando || contado.bs === null || contado.usd === null} onclick={cerrar}>Cerrar caja</button>
  {/snippet}
</Modal>

<style>
  .apertura {
    max-width: 560px;
  }

  .datos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    margin: 0.75rem 0 1.25rem;
  }

  .dato {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .dato strong {
    font-size: 1.5rem;
  }

  .destacado strong {
    color: var(--primario);
  }

  .subtitulo {
    margin: 1.25rem 0 0.5rem;
  }

  .positivo {
    color: var(--exito);
  }

  .negativo {
    color: var(--peligro);
  }

  .arqueo td {
    padding: 0.4rem 0.5rem;
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
