import { normalizar } from '../../core/util/texto';
import { listarClientes } from './servicio';
import type { Cliente } from './tipos';

/** Lista de clientes en memoria para las pantallas (una bodega maneja cientos, no miles). */
class AlmacenClientes {
  lista = $state.raw<Cliente[]>([]);
  version = $state(0);

  async cargar(): Promise<void> {
    this.lista = (await listarClientes()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    this.version++;
  }

  obtener(id: string | null | undefined): Cliente | null {
    return id ? (this.lista.find((c) => c.id === id) ?? null) : null;
  }

  /** Busca por nombre, cédula o teléfono. */
  buscar(texto: string, limite = 8): Cliente[] {
    const q = normalizar(texto);
    const digitos = texto.replace(/\D/g, '');
    if (!q) return this.lista.filter((c) => c.activo).slice(0, limite);
    return this.lista
      .filter(
        (c) =>
          c.activo &&
          (q.split(' ').every((t) => c.nombreNormalizado.includes(t)) ||
            (digitos.length >= 3 && (c.cedula.replace(/\D/g, '').includes(digitos) || c.telefono.replace(/\D/g, '').includes(digitos)))),
      )
      .slice(0, limite);
  }
}

export const clientes = new AlmacenClientes();
