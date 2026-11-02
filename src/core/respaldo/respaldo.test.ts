import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { guardarDispositivo, guardarNegocio, leerDispositivo, leerNegocio, NEGOCIO_PREDETERMINADO } from '../config/config';
import { db } from '../db/db';
import { ErrorNegocio, ErrorPermiso } from '../errores';
import { guardarTasaAutomatica } from '../tasa/servicio';
import { crearRespaldo, leerRespaldo, restaurarRespaldo, resumirRespaldo } from './respaldo';

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
});
