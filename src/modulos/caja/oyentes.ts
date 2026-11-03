import { usuarioEnSesion } from '../../core/auth/permisos';
import { db } from '../../core/db/db';
import { nuevoRegistro } from '../../core/db/registro';
import { suscribir } from '../../core/eventos/bus';
import { esDeCuenta, METODOS_PAGO } from '../../core/pagos';
import { usdABs } from '../../core/dinero/dinero';
import type { Compra, PagoProveedor } from '../compras/tipos';
import type { MovimientoCaja } from './tipos';

/**
 * La caja escucha a ventas: cada cobro, vuelto, anulación o devolución deja
 * un movimiento. Corren dentro de la transacción de la venta.
 */
export function registrarOyentesCaja(): void {
  suscribir('venta.registrada', async ({ venta, pagos }) => {
    for (const p of pagos.filter((x) => !esDeCuenta(x.metodo))) {
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
    for (const p of pagos.filter((x) => !esDeCuenta(x.metodo))) {
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
    if (esDeCuenta(devolucion.metodo)) return; // saldo a favor: no sale dinero
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

  // Pagos a proveedores hechos con dinero de la gaveta.
  const pagoAProveedor = async ({ compra, pago }: { compra: Compra; pago: PagoProveedor | null }) => {
    if (!pago?.desdeCaja || !pago.sesionCajaId) return;
    const moneda = METODOS_PAGO[pago.metodo].moneda;
    await db.movimientosCaja.add(
      nuevoRegistro({
        sesionCajaId: pago.sesionCajaId,
        tipo: 'pago_proveedor' as const,
        metodo: pago.metodo,
        moneda,
        monto: -pago.monto,
        equivalenteBs: -(moneda === 'USD' ? usdABs(pago.monto, pago.tasa) : pago.monto),
        documentoTipo: 'compra',
        documentoId: compra.id,
        descripcion: `Pago compra ${compra.numero}`,
        usuarioId: pago.usuarioId,
      }) satisfies MovimientoCaja,
    );
  };
  suscribir('compra.registrada', pagoAProveedor);
  suscribir('pago_proveedor.registrado', pagoAProveedor);

  suscribir('abono.registrado', async ({ movimiento, cliente, sesionCajaId, metodo, monto, equivalenteBs }) => {
    await db.movimientosCaja.add(
      nuevoRegistro({
        sesionCajaId,
        tipo: 'abono_cliente' as const,
        metodo,
        moneda: METODOS_PAGO[metodo].moneda,
        monto,
        equivalenteBs,
        documentoTipo: 'cliente',
        documentoId: cliente.id,
        descripcion: `Abono de ${cliente.nombre}`,
        usuarioId: movimiento.usuarioId,
      }) satisfies MovimientoCaja,
    );
  });
}
