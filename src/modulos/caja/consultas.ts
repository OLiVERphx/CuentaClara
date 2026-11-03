import { db } from '../../core/db/db';
import { dispositivoId } from '../../core/db/registro';
import type { Gasto, MovimientoCaja, SesionCaja } from './tipos';

/**
 * Consultas de solo lectura de la caja. Otros módulos (ventas) pueden usarlas;
 * para escribir en la caja se usan eventos.
 */
export async function sesionAbierta(): Promise<SesionCaja | null> {
  const abiertas = await db.sesionesCaja.where('estado').equals('abierta').toArray();
  return abiertas.find((s) => s.equipoId === dispositivoId()) ?? null;
}

export async function movimientosDeSesion(sesionId: string): Promise<MovimientoCaja[]> {
  const movimientos = await db.movimientosCaja.where('sesionCajaId').equals(sesionId).toArray();
  return movimientos.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

export async function sesionesRecientes(limite = 20): Promise<SesionCaja[]> {
  return db.sesionesCaja.orderBy('abiertaEn').reverse().limit(limite).toArray();
}

export async function obtenerSesion(id: string): Promise<SesionCaja | undefined> {
  return db.sesionesCaja.get(id);
}

export async function gastosDeSesion(sesionId: string): Promise<Gasto[]> {
  return db.gastos.where('sesionCajaId').equals(sesionId).toArray();
}
