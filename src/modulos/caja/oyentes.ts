import { usuarioEnSesion } from '../../core/auth/permisos';
import { db } from '../../core/db/db';
import { nuevoRegistro } from '../../core/db/registro';
import { suscribir } from '../../core/eventos/bus';
import type { MovimientoCaja } from './tipos';

/**
 * La caja escucha a ventas: cada cobro, vuelto, anulación o devolución deja
 * un movimiento. Corren dentro de la transacción de la venta.
 */
export function registrarOyentesCaja(): void {
  suscribir('venta.registrada', async ({ venta, pagos }) => {
    for (const p of pagos) {
      const signo = p.esVuelto ? -1 : 1;
      await db.movimientosCaja.add(
        nuevoRegistro({
          sesionCajaId: venta.sesionCajaId,
          tipo: p.esVuelto ? ('vuelto' as const) : ('venta' as const),
          metodo: p.metodo,
          moneda: p.moneda,
          monto: signo * p.monto,
          equivalenteBs: signo * p.equivalenteBs,
          documentoTipo: 'venta',
          documentoId: venta.id,
          descripcion: `Venta ${venta.numero}`,
          usuarioId: venta.usuarioId,
        }) satisfies MovimientoCaja,
      );
    }
  });

  suscribir('venta.anulada', async ({ venta, pagos, sesionCajaId }) => {
    for (const p of pagos) {
      // Se revierte cada cobro (sale) y cada vuelto (vuelve a entrar).
      const signo = p.esVuelto ? 1 : -1;
      await db.movimientosCaja.add(
        nuevoRegistro({
          sesionCajaId,
          tipo: 'anulacion' as const,
          metodo: p.metodo,
          moneda: p.moneda,
          monto: signo * p.monto,
          equivalenteBs: signo * p.equivalenteBs,
          documentoTipo: 'venta',
          documentoId: venta.id,
          descripcion: `Anulación de ${venta.numero}`,
          usuarioId: usuarioEnSesion()?.id ?? null,
        }) satisfies MovimientoCaja,
      );
    }
  });

  suscribir('devolucion.registrada', async ({ devolucion }) => {
    await db.movimientosCaja.add(
      nuevoRegistro({
        sesionCajaId: devolucion.sesionCajaId,
        tipo: 'devolucion' as const,
        metodo: devolucion.metodo,
        moneda: devolucion.moneda,
        monto: -devolucion.monto,
        equivalenteBs: -devolucion.montoBs,
        documentoTipo: 'devolucion',
        documentoId: devolucion.id,
        descripcion: `Devolución ${devolucion.numero}`,
        usuarioId: devolucion.usuarioId,
      }) satisfies MovimientoCaja,
    );
  });
}
