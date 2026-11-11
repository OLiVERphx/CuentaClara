import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { guardarDispositivo, guardarNegocio, leerDispositivo, leerNegocio, NEGOCIO_PREDETERMINADO } from '../config/config';
import { db } from '../db/db';
import { ErrorNegocio, ErrorPermiso } from '../errores';
import { guardarTasaAutomatica } from '../tasa/servicio';
import { configurarRespaldoAuto, ejecutarRespaldoAutomatico, leerRespaldoAuto, type Carpeta } from './automatico';
import { crearUsuario } from '../auth/usuarios';
import {
  crearRespaldo,
  exportarContenido,
  leerRespaldo,
  prefijosUsados,
  restaurarEnEquipoNuevo,
  restaurarRespaldo,
  resumirRespaldo,
} from './respaldo';

describe('respaldo', () => {
  beforeEach(async () => {
    await reiniciarBase();
    sesionDePrueba();
    await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Bodega La Esquina' });
    await guardarDispositivo({ id: 'laptop', nombre: 'Laptop', prefijo: 'L' });
    await guardarTasaAutomatica('2026-11-02', 8_895_754);
  });

  it('exige permiso y una contraseña de 8 caracteres', async () => {
    await expect(crearRespaldo('corta')).rejects.toThrow(ErrorNegocio);
    sesionDePrueba('cajero');
    await expect(crearRespaldo('contrasena-larga')).rejects.toThrow(ErrorPermiso);
  });

  it('cifra el contenido: el nombre del negocio no aparece en el archivo', async () => {
    const archivo = await crearRespaldo('contrasena-larga');
    const texto = new TextDecoder().decode(await archivo.arrayBuffer());
    expect(texto.startsWith('BDG1')).toBe(true);
    expect(texto).not.toContain('Esquina');
  });

  it('rechaza una contraseña incorrecta o un archivo ajeno', async () => {
    const archivo = await crearRespaldo('contrasena-larga');
    await expect(leerRespaldo(archivo, 'otra-contrasena')).rejects.toThrow('Contraseña incorrecta');
    await expect(leerRespaldo(new Blob(['hola mundo, no soy un respaldo']), 'contrasena-larga')).rejects.toThrow(
      'no es un respaldo',
    );
  });

  it('la contraseña del respaldo automático no viaja en el respaldo', async () => {
    await configurarRespaldoAuto({ activo: true, contrasena: 'clave-secreta-123' });
    const contenido = await exportarContenido();
    expect(JSON.stringify(contenido)).not.toContain('clave-secreta-123');
  });

  it('respaldo automático: desactivado, a descarga sin carpeta o guardado en la carpeta', async () => {
    expect(await ejecutarRespaldoAutomatico()).toEqual({ estado: 'desactivado' });
    await configurarRespaldoAuto({ activo: true, contrasena: 'clave-secreta-123' });
    const sinCarpeta = await ejecutarRespaldoAutomatico();
    expect(sinCarpeta.estado).toBe('descargar');

    const escritos: { nombre: string; tamano: number }[] = [];
    const carpeta: Carpeta = {
      name: 'PENDRIVE',
      queryPermission: async () => 'granted',
      getFileHandle: async (nombre) => ({
        createWritable: async () => ({
          write: async (datos: Blob) => {
            escritos.push({ nombre, tamano: datos.size });
          },
          close: async () => {},
        }),
      }),
    };
    const r = await ejecutarRespaldoAutomatico({ carpeta });
    expect(r).toMatchObject({ estado: 'guardado', carpeta: 'PENDRIVE' });
    expect(escritos).toHaveLength(1);
    expect(escritos[0]!.nombre).toMatch(/^respaldo-bodega-\d{4}-\d{2}-\d{2}-\d{4}\.bodega$/);
    expect((await leerRespaldoAuto()).ultimo).not.toBeNull();
    // El archivo guardado se puede abrir con la contraseña.
    await expect(leerRespaldo((sinCarpeta as { archivo: Blob }).archivo, 'clave-secreta-123')).resolves.toBeTruthy();
  });

  it('restaura todo y conserva la identidad del equipo', async () => {
    const archivo = await crearRespaldo('contrasena-larga');

    // Cambios posteriores que el respaldo debe deshacer.
    await guardarNegocio({ ...NEGOCIO_PREDETERMINADO, nombre: 'Otro nombre' });
    await guardarTasaAutomatica('2026-11-03', 9_000_000);
    await guardarDispositivo({ id: 'telefono', nombre: 'Teléfono', prefijo: 'T' });

    const contenido = await leerRespaldo(archivo, 'contrasena-larga');
    expect(resumirRespaldo(contenido)).toMatchObject({ tasas: 1 });
    await restaurarRespaldo(contenido);

    expect((await leerNegocio())?.nombre).toBe('Bodega La Esquina');
    expect(await db.tasas.count()).toBe(1);
    expect((await leerDispositivo())?.prefijo).toBe('T');
  });

  it('un equipo nuevo carga la bodega de otro con su propio prefijo', async () => {
    await crearUsuario({ nombre: 'Oliver', rol: 'dueno', pin: '1234' });
    const contenido = await leerRespaldo(await crearRespaldo('contrasena-larga'), 'contrasena-larga');
    contenido.datos.ventas = [{ numero: 'L-000001' }, { numero: 'L-000002' }];
    expect([...prefijosUsados(contenido)]).toEqual(['L']);

    await reiniciarBase(); // el teléfono, recién abierto
    await expect(restaurarEnEquipoNuevo(contenido, { nombre: 'Teléfono', prefijo: 'l' })).rejects.toThrow('ya lo usa otro equipo');
    contenido.datos.ventas = [];
    await guardarDispositivo({ id: 'x', nombre: 'x', prefijo: 'X' }); // queda de un intento a medias
    await restaurarEnEquipoNuevo(contenido, { nombre: 'Teléfono', prefijo: 't' });

    expect((await leerNegocio())?.nombre).toBe('Bodega La Esquina');
    expect(await db.usuarios.count()).toBe(1);
    const dispositivo = await leerDispositivo();
    expect(dispositivo).toMatchObject({ nombre: 'Teléfono', prefijo: 'T' });
    expect(dispositivo?.id).not.toBe('x');
    // Con la bodega ya cargada no sirve para saltarse el PIN.
    await expect(restaurarEnEquipoNuevo(contenido, { nombre: 'Otro', prefijo: 'O' })).rejects.toThrow('ya tiene una bodega');
  });
});
