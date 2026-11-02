import { aBase64, bytesAleatorios, desdeBase64, igualesSeguro } from '../util/bytes';

/**
 * Iteraciones de PBKDF2 para el PIN. Un PIN de 4–6 dígitos tiene muy pocas
 * combinaciones, así que ninguna cantidad de iteraciones lo vuelve resistente
 * a un ataque con el equipo en la mano; el hash evita guardarlo en claro y el
 * bloqueo por intentos frena a quien prueba en pantalla. Se elige un valor que
 * desbloquea rápido en teléfonos modestos. Se guarda por usuario para poder
 * subirlo en el futuro sin romper PINs existentes.
 */
export const ITERACIONES_PIN = 150_000;

export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

async function derivar(pin: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, clave, 256);
  return new Uint8Array(bits);
}

export async function crearCredencial(pin: string): Promise<{ pinHash: string; pinSal: string; pinIteraciones: number }> {
  const sal = bytesAleatorios(16);
  const hash = await derivar(pin, sal, ITERACIONES_PIN);
  return { pinHash: aBase64(hash), pinSal: aBase64(sal), pinIteraciones: ITERACIONES_PIN };
}

export async function verificarPin(
  pin: string,
  credencial: { pinHash: string; pinSal: string; pinIteraciones: number },
): Promise<boolean> {
  const hash = await derivar(pin, desdeBase64(credencial.pinSal), credencial.pinIteraciones);
  return igualesSeguro(hash, desdeBase64(credencial.pinHash));
}
