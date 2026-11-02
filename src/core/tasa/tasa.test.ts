import { beforeEach, describe, expect, it } from 'vitest';
import { reiniciarBase, sesionDePrueba } from '../../test/util';
import { db } from '../db/db';
import { ErrorNegocio, ErrorPermiso } from '../errores';
import { suscribir } from '../eventos/bus';
import { interpretarRespuesta } from './fuente';
import { antiguedadEnDias, elegirProxima, elegirVigente, tasaAplicada, tasaEstaVieja } from './logica';
import {
  actualizarTasaAutomatica,
  guardarTasaAutomatica,
  historialTasas,
  obtenerTasaVigente,
  registrarTasaManual,
} from './servicio';

const t = (fechaValor: string, eliminadoEn: string | null = null) => ({ fechaValor, eliminadoEn });

describe('elegirVigente', () => {
  const tasas = [t('2026-10-29'), t('2026-10-30'), t('2026-11-03'), t('2026-10-31', '2026-10-31T10:00:00Z')];

  it('elige la mayor fecha valor que no sea futura', () => {
    expect(elegirVigente(tasas, '2026-11-02')?.fechaValor).toBe('2026-10-30');
    expect(elegirVigente(tasas, '2026-11-03')?.fechaValor).toBe('2026-11-03');
  });

  it('ignora las tasas eliminadas', () => {
    expect(elegirVigente(tasas, '2026-10-31')?.fechaValor).toBe('2026-10-30');
  });

  it('devuelve null si no hay ninguna aplicable', () => {
    expect(elegirVigente(tasas, '2026-10-01')).toBeNull();
    expect(elegirVigente([], '2026-11-02')).toBeNull();
  });

  it('encuentra la próxima tasa publicada', () => {
    expect(elegirProxima(tasas, '2026-11-02')?.fechaValor).toBe('2026-11-03');
    expect(elegirProxima(tasas, '2026-11-03')).toBeNull();
  });
});

describe('antigüedad y ajuste', () => {
  it('cuenta los días y avisa si la tasa es vieja', () => {
    expect(antiguedadEnDias({ fechaValor: '2026-10-30' }, '2026-11-02')).toBe(3);
    expect(tasaEstaVieja({ fechaValor: '2026-10-30' }, '2026-11-02', 3)).toBe(false);
    expect(tasaEstaVieja({ fechaValor: '2026-10-29' }, '2026-11-02', 3)).toBe(true);
  });

  it('aplica el ajuste del negocio', () => {
    expect(tasaAplicada({ valor: 1_000_000 }, 300)).toBe(1_030_000);
  });
});

describe('interpretarRespuesta', () => {
  it('lee la respuesta de DolarApi', () => {
    const r = interpretarRespuesta({ promedio: 889.5754, fechaActualizacion: '2026-11-02T00:00:00-04:00' });
    expect(r).toEqual({ fechaValor: '2026-11-02', valor: 8_895_754 });
  });

  it('rechaza respuestas incompletas', () => {
    expect(() => interpretarRespuesta({})).toThrow(ErrorNegocio);
    expect(() => interpretarRespuesta({ promedio: 0, fechaActualizacion: '2026-11-02' })).toThrow(ErrorNegocio);
    expect(() => interpretarRespuesta({ promedio: 10 })).toThrow(ErrorNegocio);
    expect(() => interpretarRespuesta(null)).toThrow(ErrorNegocio);
  });
});

describe('servicio de tasa', () => {
  beforeEach(reiniciarBase);

  it('exige permiso para cargar a mano', async () => {
    await expect(registrarTasaManual('2026-11-02', 8_895_754)).rejects.toThrow(ErrorPermiso);
    sesionDePrueba('cajero');
    await expect(registrarTasaManual('2026-11-02', 8_895_754)).rejects.toThrow(ErrorPermiso);
  });

  it('registra, corrige y audita la carga manual', async () => {
    sesionDePrueba();
    await registrarTasaManual('2026-11-02', 8_800_000);
    await registrarTasaManual('2026-11-02', 8_895_754);
    const tasas = await historialTasas();
    expect(tasas).toHaveLength(1);
    expect(tasas[0]).toMatchObject({ valor: 8_895_754, fuente: 'manual', version: 2 });
    expect(await db.auditoria.count()).toBe(2);
  });

  it('la tasa automática no pisa una manual de la misma fecha', async () => {
    sesionDePrueba();
    await registrarTasaManual('2026-11-02', 8_900_000);
    expect(await guardarTasaAutomatica('2026-11-02', 8_895_754)).toBeNull();
    expect((await obtenerTasaVigente('2026-11-02'))?.valor).toBe(8_900_000);
  });

  it('la tasa automática no duplica si el valor no cambió', async () => {
    expect(await guardarTasaAutomatica('2026-11-02', 8_895_754)).not.toBeNull();
    expect(await guardarTasaAutomatica('2026-11-02', 8_895_754)).toBeNull();
    expect(await db.tasas.count()).toBe(1);
  });

  it('una tasa con fecha valor de mañana no rige hasta mañana', async () => {
    await guardarTasaAutomatica('2026-11-02', 8_895_754);
    await guardarTasaAutomatica('2026-11-03', 8_950_000);
    expect((await obtenerTasaVigente('2026-11-02'))?.valor).toBe(8_895_754);
    expect((await obtenerTasaVigente('2026-11-03'))?.valor).toBe(8_950_000);
  });

  it('rechaza valores y fechas inválidos', async () => {
    await expect(guardarTasaAutomatica('2026-02-30', 1)).rejects.toThrow(ErrorNegocio);
    await expect(guardarTasaAutomatica('2026-11-02', 0)).rejects.toThrow(ErrorNegocio);
  });

  it('consulta la fuente, guarda y avisa', async () => {
    const avisos: number[] = [];
    suscribir('tasa.actualizada', ({ tasa }) => {
      avisos.push(tasa.valor);
    });
    const fetchFalso = (async () =>
      new Response(JSON.stringify({ promedio: 889.5754, fechaActualizacion: '2026-11-02T00:00:00-04:00' }))) as typeof fetch;
    const tasa = await actualizarTasaAutomatica(fetchFalso);
    expect(tasa).toMatchObject({ fechaValor: '2026-11-02', valor: 8_895_754, fuente: 'auto' });
    expect(avisos).toEqual([8_895_754]);
  });

  it('traduce los fallos de red a un mensaje claro', async () => {
    const fetchCaido = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(actualizarTasaAutomatica(fetchCaido)).rejects.toThrow('No se pudo consultar la tasa');
  });
});
