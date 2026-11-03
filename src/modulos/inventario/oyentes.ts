import { leerNegocio } from '../../core/config/config';
import { db } from '../../core/db/db';
import { formatearCantidad } from '../../core/dinero/dinero';
import { ErrorNegocio } from '../../core/errores';
import { suscribir } from '../../core/eventos/bus';
import { aplicarMovimiento } from './servicio';

async function productoVigente(id: string) {
  const producto = await db.productos.get(id);
  if (!producto || producto.eliminadoEn !== null) throw new ErrorNegocio('Un producto del ticket ya no existe.');
  return producto;
}

/**
 * El inventario escucha a ventas: el stock baja al vender y vuelve al anular
 * o devolver. Corren dentro de la transacción de la venta: si algo falla,
 * la venta completa se deshace.
 */
export function registrarOyentesInventario(): void {
  suscribir('venta.registrada', async ({ venta, items }) => {
    const negocio = await leerNegocio();
    for (const item of items) {
      const producto = await productoVigente(item.productoId);
      if (!negocio?.permitirStockNegativo && producto.stock < item.cantidadBase) {
        throw new ErrorNegocio(
          `No hay suficiente «${producto.nombre}»: el sistema registra ${formatearCantidad(producto.stock, producto.unidad)}.`,
        );
      }
      await aplicarMovimiento(producto, {
        tipo: 'venta',
        cantidad: item.cantidadBase,
        motivo: `Venta ${venta.numero}`,
        documentoTipo: 'venta',
        documentoId: venta.id,
      });
    }
  });

  suscribir('venta.anulada', async ({ venta, items }) => {
    for (const item of items) {
      await aplicarMovimiento(await productoVigente(item.productoId), {
        tipo: 'anulacion',
        cantidad: item.cantidadBase,
        motivo: `Anulación de ${venta.numero}`,
        documentoTipo: 'venta',
        documentoId: venta.id,
      });
    }
  });

  // Compras: entra el stock y el costo promedio se recalcula con el costo de la factura (D7).
  suscribir('compra.registrada', async ({ compra, items }) => {
    for (const item of items) {
      await aplicarMovimiento(await productoVigente(item.productoId), {
        tipo: 'entrada_compra',
        cantidad: item.cantidadBase,
        costoUnitario: item.costoBaseUsd,
        motivo: `Compra ${compra.numero}`,
        documentoTipo: 'compra',
        documentoId: compra.id,
      });
    }
  });

  suscribir('devolucion.registrada', async ({ devolucion, items }) => {
    for (const item of items) {
      await aplicarMovimiento(await productoVigente(item.productoId), {
        tipo: 'devolucion',
        cantidad: item.cantidadBase,
        motivo: `Devolución ${devolucion.numero}`,
        documentoTipo: 'devolucion',
        documentoId: devolucion.id,
      });
    }
  });
}
