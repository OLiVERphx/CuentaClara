import { tienePermiso } from '../../core/auth/permisos';
import { db } from '../../core/db/db';
import { vigente } from '../../core/db/registro';
import { formatearUsd } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { suscribir } from '../../core/eventos/bus';
import { esDeCuenta } from '../../core/pagos';
import { aplicarMovimientoCuenta } from './servicio';

/**
 * Los clientes escuchan a ventas: fiar, usar saldo a favor o dejar el vuelto
 * a favor mueve la cuenta del cliente. Corren dentro de la transacción de la
 * venta: si el cliente supera su límite, la venta completa no se guarda.
 */
export function registrarOyentesClientes(): void {
  suscribir('venta.registrada', async ({ venta, pagos }) => {
    const deCuenta = pagos.filter((p) => esDeCuenta(p.metodo));
    if (deCuenta.length === 0) return;
    if (!venta.clienteId) throw new ErrorNegocio('Para fiar o usar saldo a favor, elige el cliente.');
    const cliente = await db.clientes.get(venta.clienteId);
    if (!cliente || !vigente(cliente) || !cliente.activo) throw new ErrorNegocio('El cliente de la venta no está disponible.');

    for (const p of deCuenta) {
      const actual = (await db.clientes.get(cliente.id))!;
      const doc = { documentoTipo: 'venta', documentoId: venta.id };
      if (p.metodo === 'credito') {
        if (p.esVuelto) throw new ErrorNegocio('El vuelto no se puede fiar.');
        const nuevoSaldo = actual.saldoUsd + p.monto;
        if (actual.limiteCreditoUsd !== null && nuevoSaldo > actual.limiteCreditoUsd && !tienePermiso('clientes.exceder_limite')) {
          throw new ErrorNegocio(
            `${actual.nombre} superaría su límite de crédito de ${formatearUsd(actual.limiteCreditoUsd)} (debe ${formatearUsd(Math.max(actual.saldoUsd, 0))}).`,
          );
        }
        await aplicarMovimientoCuenta(cliente.id, { tipo: 'cargo', monto: p.monto, descripcion: `Venta ${venta.numero}`, ...doc });
      } else if (!p.esVuelto) {
        const disponible = -actual.saldoUsd;
        if (p.monto > disponible) {
          throw new ErrorNegocio(`${actual.nombre} tiene ${formatearUsd(Math.max(disponible, 0))} a favor; no alcanza.`);
        }
        await aplicarMovimientoCuenta(cliente.id, { tipo: 'consumo_saldo', monto: p.monto, descripcion: `Venta ${venta.numero}`, ...doc });
      } else {
        await aplicarMovimientoCuenta(cliente.id, {
          tipo: 'saldo_a_favor',
          monto: -p.monto,
          descripcion: `Vuelto a favor, venta ${venta.numero}`,
          ...doc,
        });
      }
    }
  });

  suscribir('venta.anulada', async ({ venta, pagos }) => {
    if (!venta.clienteId) return;
    for (const p of pagos.filter((x) => esDeCuenta(x.metodo))) {
      // Fiado y uso de saldo subieron la deuda: se bajan. El vuelto a favor la bajó: se sube.
      const revertir = p.esVuelto ? p.monto : -p.monto;
      await aplicarMovimientoCuenta(venta.clienteId, {
        tipo: 'anulacion',
        monto: revertir,
        descripcion: `Anulación de ${venta.numero}`,
        documentoTipo: 'venta',
        documentoId: venta.id,
      });
    }
  });

  suscribir('devolucion.registrada', async ({ devolucion }) => {
    if (devolucion.metodo !== 'saldo_a_favor') return;
    const venta = await db.ventas.get(devolucion.ventaId);
    if (!venta?.clienteId) throw new ErrorNegocio('Esta venta no tiene cliente: no se puede dejar saldo a favor.');
    await aplicarMovimientoCuenta(venta.clienteId, {
      tipo: 'saldo_a_favor',
      monto: -devolucion.monto,
      descripcion: `Devolución ${devolucion.numero}`,
      documentoTipo: 'devolucion',
      documentoId: devolucion.id,
    });
  });
}
