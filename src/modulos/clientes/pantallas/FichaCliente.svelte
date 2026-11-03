<script lang="ts">
  import { untrack } from 'svelte';
  import { puede, redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import type { PropsPantalla } from '../../../app/modulos';
  import { navegar } from '../../../app/router.svelte';
  import {
    bsAUsd,
    ESCALA,
    formatearBs,
    formatearParaEditar,
    formatearUsd,
    parsearDecimal,
    redondearAPaso,
    usdABs,
  } from '../../../core/dinero/dinero';
  import { ErrorNegocio } from '../../../core/errores';
  import { formatearMonto, METODOS_PAGO, ORDEN_METODOS, type MetodoPago } from '../../../core/pagos';
  import { formatearFechaHora } from '../../../core/util/fechas';
  import Icono from '../../../ui/Icono.svelte';
  import Modal from '../../../ui/Modal.svelte';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { caja } from '../../caja/almacen.svelte';
  import { clientes } from '../almacen.svelte';
  import { actualizarCliente, crearCliente, movimientosDeCliente, registrarAbono, registrarAjusteCuenta } from '../servicio';
  import { TIPOS_MOVIMIENTO_CUENTA, type Cliente, type MovimientoCuenta } from '../tipos';

  let { params }: PropsPantalla = $props();
  const id = untrack(() => params.id);
  const esNuevo = !id;
  const editable = puede('clientes.gestionar');
  const tasa = $derived(tasaDelDia());

  const inicial = id ? clientes.obtener(id) : null;
  let f = $state({
    nombre: inicial?.nombre ?? '',
    cedula: inicial?.cedula ?? '',
    telefono: inicial?.telefono ?? '',
    limite: inicial?.limiteCreditoUsd != null ? formatearParaEditar(inicial.limiteCreditoUsd, ESCALA.centavos) : '',
    nota: inicial?.nota ?? '',
    activo: inicial?.activo ?? true,
  });
  let guardando = $state(false);
  let movimientos = $state<MovimientoCuenta[]>([]);

  const cliente = $derived.by((): Cliente | null => {
    void clientes.version;
    return clientes.obtener(id);
  });

  $effect(() => {
    void clientes.version;
    if (id) void movimientosDeCliente(id).then((m) => (movimientos = m));
  });

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    guardando = true;
    try {
      const limite = f.limite.trim() === '' ? null : parsearDecimal(f.limite, ESCALA.centavos);
      if (f.limite.trim() !== '' && limite === null) throw new ErrorNegocio('El límite de crédito no es válido.');
      const datos = { nombre: f.nombre, cedula: f.cedula, telefono: f.telefono, limiteCreditoUsd: limite, nota: f.nota, activo: f.activo };
      if (esNuevo) {
        const nuevo = await crearCliente(datos);
        avisar(`Cliente «${nuevo.nombre}» creado.`);
        navegar(`/clientes/${nuevo.id}`);
      } else if (id) {
        await actualizarCliente(id, datos);
        avisar('Cambios guardados.');
      }
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }

  // ── Abono ──
  let abonoAbierto = $state(false);
  let abono = $state({ metodo: 'efectivo_bs' as MetodoPago, monto: '', nota: '' });
  const monedaAbono = $derived(METODOS_PAGO[abono.metodo].moneda);
  const montoAbono = $derived(parsearDecimal(abono.monto, ESCALA.centavos));
  const abonoUsd = $derived(
    montoAbono === null || tasa === null ? null : monedaAbono === 'USD' ? montoAbono : bsAUsd(montoAbono, tasa),
  );

  function pagarTodo() {
    if (!cliente || cliente.saldoUsd <= 0 || tasa === null) return;
    const monto =
      monedaAbono === 'USD'
        ? cliente.saldoUsd
        : METODOS_PAGO[abono.metodo].efectivo
          ? redondearAPaso(usdABs(cliente.saldoUsd, tasa), redondeoBs().paso, 'arriba')
          : usdABs(cliente.saldoUsd, tasa);
    abono.monto = formatearParaEditar(monto, ESCALA.centavos);
  }

  async function guardarAbono() {
    if (!id || !montoAbono) return;
    guardando = true;
    try {
      const m = await registrarAbono({ clienteId: id, metodo: abono.metodo, monto: montoAbono, nota: abono.nota });
      avisar(`Abono de ${formatearUsd(-m.monto)} registrado. Saldo: ${formatearUsd(m.saldoResultante)}.`);
      abonoAbierto = false;
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }

  // ── Ajuste ──
  let ajusteAbierto = $state(false);
  let ajuste = $state({ sentido: 1 as 1 | -1, monto: '', motivo: '' });
  const montoAjuste = $derived(parsearDecimal(ajuste.monto, ESCALA.centavos));

  async function guardarAjuste() {
    if (!id || !montoAjuste) return;
    guardando = true;
    try {
      await registrarAjusteCuenta({ clienteId: id, montoUsd: ajuste.sentido * montoAjuste, motivo: ajuste.motivo });
      avisar('Ajuste registrado.');
      ajusteAbierto = false;
    } catch (err) {
      avisarError(err);
    } finally {
      guardando = false;
    }
  }
</script>

{#if !esNuevo && !cliente}
  <div class="vacio">
    <p>Este cliente no existe.</p>
    <p><a href="#/clientes">Volver a clientes</a></p>
  </div>
{:else}
  <div class="encabezado-pagina">
    <div class="fila">
      <a class="btn btn-fantasma" href="#/clientes" aria-label="Volver"><Icono nombre="atras" /></a>
      <h1>{esNuevo ? 'Nuevo cliente' : cliente?.nombre}</h1>
    </div>
  </div>

  <div class="ficha">
    {#if cliente}
      <section class="tarjeta pila saldo" class:debe={cliente.saldoUsd > 0} class:favor={cliente.saldoUsd < 0}>
        <span class="suave">{cliente.saldoUsd > 0 ? 'Debe' : cliente.saldoUsd < 0 ? 'Saldo a favor' : 'Cuenta'}</span>
        <strong class="num monto-saldo">{cliente.saldoUsd === 0 ? 'Al día' : formatearUsd(Math.abs(cliente.saldoUsd))}</strong>
        {#if cliente.saldoUsd !== 0 && tasa !== null}
          <span class="num">≈ {formatearBs(usdABs(Math.abs(cliente.saldoUsd), tasa))} a la tasa de hoy</span>
        {/if}
        {#if cliente.limiteCreditoUsd !== null}
          <span class="ayuda">Límite de crédito: {formatearUsd(cliente.limiteCreditoUsd)}</span>
        {/if}
        <div class="fila">
          <button class="btn btn-primario" disabled={!caja.sesion} title={caja.sesion ? '' : 'Abre la caja para recibir abonos'}
            onclick={() => { abono = { metodo: 'efectivo_bs', monto: '', nota: '' }; abonoAbierto = true; }}>
            Registrar abono
          </button>
          {#if editable}
            <button class="btn" onclick={() => { ajuste = { sentido: 1, monto: '', motivo: '' }; ajusteAbierto = true; }}>Ajustar cuenta</button>
          {/if}
        </div>
        {#if !caja.sesion}<p class="ayuda">Abre la caja para recibir abonos.</p>{/if}
      </section>
    {/if}

    <form class="tarjeta pila" onsubmit={guardar}>
      <h2>Datos</h2>
      <fieldset class="pila" disabled={!editable}>
        <label class="campo">
          <span>Nombre *</span>
          <input bind:value={f.nombre} maxlength="80" placeholder="María Pérez" />
        </label>
        <div class="rejilla">
          <label class="campo">
            <span>Cédula</span>
            <input bind:value={f.cedula} placeholder="V-12345678" class="mono" />
          </label>
          <label class="campo">
            <span>Teléfono</span>
            <input bind:value={f.telefono} inputmode="tel" placeholder="0414-1234567" />
          </label>
          <label class="campo">
            <span>Límite de crédito ($)</span>
            <input bind:value={f.limite} inputmode="decimal" class="num" placeholder="Sin límite" />
          </label>
        </div>
        <label class="campo">
          <span>Nota</span>
          <input bind:value={f.nota} maxlength="200" placeholder="Vecina de la casa azul" />
        </label>
        {#if !esNuevo}
          <label class="casilla"><input type="checkbox" bind:checked={f.activo} /> Activo (se puede elegir al vender)</label>
        {/if}
      </fieldset>
      {#if editable}
        <div><button class="btn btn-primario" disabled={guardando}>{esNuevo ? 'Crear cliente' : 'Guardar cambios'}</button></div>
      {/if}
    </form>
  </div>

  {#if cliente}
    <section class="pila-chica historial">
      <h2>Movimientos de la cuenta</h2>
      {#if movimientos.length === 0}
        <p class="vacio">Sin movimientos.</p>
      {:else}
        <div class="tabla-contenedor">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th class="ocultable">Detalle</th><th class="derecha">Monto</th><th class="derecha">Saldo</th></tr>
            </thead>
            <tbody>
              {#each movimientos as m (m.id)}
                <tr>
                  <td class="suave">{formatearFechaHora(m.creadoEn)}</td>
                  <td>{TIPOS_MOVIMIENTO_CUENTA[m.tipo]}</td>
                  <td class="ocultable suave">
                    {#if m.documentoTipo === 'venta' && m.documentoId}<a href="#/ventas/{m.documentoId}">{m.descripcion}</a>{:else}{m.descripcion}{/if}
                    {#if m.metodo && m.montoOriginal !== null && m.moneda}
                      · {METODOS_PAGO[m.metodo].nombre} {formatearMonto(m.montoOriginal, m.moneda)}
                    {/if}
                  </td>
                  <td class="derecha num" class:sube={m.monto > 0} class:baja={m.monto < 0}>{m.monto > 0 ? '+' : '−'}{formatearUsd(Math.abs(m.monto))}</td>
                  <td class="derecha num">{formatearUsd(m.saldoResultante)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  <Modal bind:abierto={abonoAbierto} titulo="Abono de {cliente?.nombre}">
    <div class="rejilla">
      <label class="campo">
        <span>Paga con</span>
        <select bind:value={abono.metodo}>
          {#each ORDEN_METODOS as m}<option value={m}>{METODOS_PAGO[m].nombre}</option>{/each}
        </select>
      </label>
      <label class="campo">
        <span>Monto ({monedaAbono === 'USD' ? '$' : 'Bs'})</span>
        <input bind:value={abono.monto} inputmode="decimal" class="num" aria-invalid={abono.monto !== '' && !montoAbono} />
      </label>
    </div>
    {#if cliente && cliente.saldoUsd > 0}
      <button type="button" class="btn btn-chico" onclick={pagarTodo}>Paga todo lo que debe</button>
    {/if}
    <label class="campo">
      <span>Nota</span>
      <input bind:value={abono.nota} maxlength="120" />
    </label>
    {#if abonoUsd !== null && abonoUsd > 0 && cliente}
      <div class="alerta alerta-info">
        <span>
          Abona <strong class="num">{formatearUsd(abonoUsd)}</strong>{monedaAbono === 'VES' ? ' (a la tasa de hoy)' : ''}.
          Queda {cliente.saldoUsd - abonoUsd >= 0 ? 'debiendo' : 'con saldo a favor de'}
          <strong class="num">{formatearUsd(Math.abs(cliente.saldoUsd - abonoUsd))}</strong>.
        </span>
      </div>
    {/if}
    {#snippet acciones()}
      <button class="btn" onclick={() => (abonoAbierto = false)}>Cancelar</button>
      <button class="btn btn-primario" disabled={guardando || !montoAbono} onclick={guardarAbono}>Registrar abono</button>
    {/snippet}
  </Modal>

  <Modal bind:abierto={ajusteAbierto} titulo="Ajustar cuenta">
    <p class="ayuda">Para cargar deudas viejas del cuaderno o corregir un error. Queda registrado en la auditoría.</p>
    <div class="segmentado" role="radiogroup" aria-label="Sentido del ajuste">
      <label><input type="radio" bind:group={ajuste.sentido} value={1} /> Aumentar deuda</label>
      <label><input type="radio" bind:group={ajuste.sentido} value={-1} /> Disminuir deuda</label>
    </div>
    <label class="campo">
      <span>Monto ($)</span>
      <input bind:value={ajuste.monto} inputmode="decimal" class="num" aria-invalid={ajuste.monto !== '' && !montoAjuste} />
    </label>
    <label class="campo">
      <span>Motivo *</span>
      <input bind:value={ajuste.motivo} maxlength="120" placeholder="Deuda del cuaderno" />
    </label>
    {#snippet acciones()}
      <button class="btn" onclick={() => (ajusteAbierto = false)}>Cancelar</button>
      <button class="btn btn-primario" disabled={guardando || !montoAjuste || !ajuste.motivo.trim()} onclick={guardarAjuste}>Registrar ajuste</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .ficha {
    display: grid;
    grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.2fr);
    gap: 1rem;
    align-items: start;
  }

  .ficha > form:only-child {
    grid-column: 1 / -1;
    max-width: 720px;
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .saldo {
    gap: 0.4rem;
  }

  .monto-saldo {
    font-size: 2.2rem;
    line-height: 1.1;
  }

  .debe .monto-saldo {
    color: var(--peligro);
  }

  .favor .monto-saldo {
    color: var(--exito);
  }

  .historial {
    margin-top: 1.5rem;
  }

  .sube {
    color: var(--peligro);
  }

  .baja {
    color: var(--exito);
  }

  @media (max-width: 860px) {
    .ficha {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .ocultable {
      display: none;
    }
  }
</style>
