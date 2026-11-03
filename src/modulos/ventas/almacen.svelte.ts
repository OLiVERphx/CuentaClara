import { ESCALA, formatearParaEditar, parsearDecimal, type Milesimas } from '../../core/dinero/dinero';

export interface EntradaTicketUI {
  clave: string;
  productoId: string;
  presentacionId: string | null;
  cantidad: Milesimas;
  /** Lo que el usuario escribió en el campo de cantidad. */
  texto: string;
}

/** Ticket en curso. Vive en memoria: sobrevive a cambiar de pantalla, no a recargar. */
class Ticket {
  lineas = $state<EntradaTicketUI[]>([]);

  /** Agrega una unidad (o 1 kg) o suma a la línea existente. Devuelve la clave de la línea. */
  agregar(productoId: string, presentacionId: string | null): string {
    const clave = `${productoId}:${presentacionId ?? ''}`;
    const existente = this.lineas.find((l) => l.clave === clave);
    if (existente) {
      existente.cantidad += 1000;
      existente.texto = formatearParaEditar(existente.cantidad, ESCALA.milesimas);
    } else {
      this.lineas.push({ clave, productoId, presentacionId, cantidad: 1000, texto: '1' });
    }
    return clave;
  }

  cambiarCantidad(clave: string, texto: string): void {
    const linea = this.lineas.find((l) => l.clave === clave);
    if (!linea) return;
    linea.texto = texto;
    linea.cantidad = parsearDecimal(texto, ESCALA.milesimas) ?? 0;
  }

  quitar(clave: string): void {
    const i = this.lineas.findIndex((l) => l.clave === clave);
    if (i >= 0) this.lineas.splice(i, 1);
  }

  vaciar(): void {
    this.lineas.length = 0;
  }
}

export const ticket = new Ticket();
