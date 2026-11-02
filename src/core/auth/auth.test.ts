import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { ErrorNegocio, ErrorPermiso } from '../errores';
import { cerrarSesion, exigirPermiso, rolTienePermiso, usuarioEnSesion } from './permisos';
import { crearCredencial, pinValido, verificarPin } from './pin';
import { cambiarPin, crearUsuario, esperaPorBloqueo, ingresar } from './usuarios';

describe('PIN', () => {
  it('valida el formato', () => {
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('123456')).toBe(true);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('1234567')).toBe(false);
    expect(pinValido('12a4')).toBe(false);
  });

  it('no guarda el PIN en claro y lo verifica', async () => {
    const credencial = await crearCredencial('2468');
    expect(JSON.stringify(credencial)).not.toContain('2468');
    expect(await verificarPin('2468', credencial)).toBe(true);
    expect(await verificarPin('2469', credencial)).toBe(false);
  });

  it('usa una sal distinta cada vez', async () => {
    const a = await crearCredencial('2468');
    const b = await crearCredencial('2468');
    expect(a.pinSal).not.toBe(b.pinSal);
    expect(a.pinHash).not.toBe(b.pinHash);
  });
});

describe('permisos', () => {
  beforeEach(() => cerrarSesion());

  it('el cajero no cambia precios ni ajusta inventario', () => {
    expect(rolTienePermiso('dueno', 'productos.editar')).toBe(true);
    expect(rolTienePermiso('cajero', 'productos.editar')).toBe(false);
    expect(rolTienePermiso('cajero', 'inventario.ajustar')).toBe(false);
  });

  it('sin sesión no hay permisos', () => {
    expect(() => exigirPermiso('productos.editar')).toThrow(ErrorPermiso);
    sesionDePrueba();
    expect(exigirPermiso('productos.editar').rol).toBe('dueno');
  });
});

describe('usuarios', () => {
  beforeEach(reiniciarBase);

  it('el primer usuario debe ser el dueño', async () => {
    await expect(crearUsuario({ nombre: 'Ana', rol: 'cajero', pin: '1234' })).rejects.toThrow(ErrorNegocio);
    const dueno = await crearUsuario({ nombre: '  Oliver  ', rol: 'dueno', pin: '1234' });
    expect(dueno.nombre).toBe('Oliver');
  });

  it('crear más usuarios exige permiso', async () => {
    await crearUsuario({ nombre: 'Oliver', rol: 'dueno', pin: '1234' });
    await expect(crearUsuario({ nombre: 'Ana', rol: 'cajero', pin: '5678' })).rejects.toThrow(ErrorPermiso);
  });

  it('ingresa con el PIN correcto y abre la sesión', async () => {
    const dueno = await crearUsuario({ nombre: 'Oliver', rol: 'dueno', pin: '1234' });
    const r = await ingresar(dueno.id, '1234');
    expect(r.ok).toBe(true);
    expect(usuarioEnSesion()?.id).toBe(dueno.id);
  });

  it('bloquea tras 5 fallos y duplica la espera', async () => {
    const dueno = await crearUsuario({ nombre: 'Oliver', rol: 'dueno', pin: '1234' });
    const t0 = 1_000_000;
    for (let i = 1; i <= 4; i++) {
      const r = await ingresar(dueno.id, '0000', t0);
      expect(r).toEqual({ ok: false, esperaMs: 0, intentosRestantes: 5 - i });
    }
    expect(await ingresar(dueno.id, '0000', t0)).toEqual({ ok: false, esperaMs: 30_000, intentosRestantes: 0 });
    // Durante el bloqueo ni el PIN correcto entra.
    expect((await ingresar(dueno.id, '1234', t0 + 10_000)).ok).toBe(false);
    expect(await esperaPorBloqueo(t0 + 10_000)).toBe(20_000);
    // Pasado el bloqueo, otro fallo espera el doble.
    expect(await ingresar(dueno.id, '0000', t0 + 31_000)).toEqual({ ok: false, esperaMs: 60_000, intentosRestantes: 0 });
    // Un acierto reinicia el contador.
    expect((await ingresar(dueno.id, '1234', t0 + 100_000)).ok).toBe(true);
    expect(await ingresar(dueno.id, '0000', t0 + 100_000)).toEqual({ ok: false, esperaMs: 0, intentosRestantes: 4 });
  });

  it('cambia el PIN solo con el PIN actual correcto', async () => {
    const dueno = await crearUsuario({ nombre: 'Oliver', rol: 'dueno', pin: '1234' });
    await expect(cambiarPin(dueno.id, '9999', '4321')).rejects.toThrow('PIN actual');
    await cambiarPin(dueno.id, '1234', '4321');
    expect((await ingresar(dueno.id, '1234')).ok).toBe(false);
    expect((await ingresar(dueno.id, '4321')).ok).toBe(true);
  });
});
