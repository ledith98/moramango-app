/**
 * app/api/admin/opiniones/route.ts
 *
 * GET → Opiniones de los clientes con sus promedios.
 *
 * Nota sobre "anónimo": el cliente puede pedir que su nombre no se
 * muestre, y aquí se respeta (se manda 'Anónimo'). El pedido sí se
 * conserva para que puedas ver qué se calificó y actuar.
 */

import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Si aún nadie ha opinado, la hoja puede no existir todavía
  let filas: Record<string, string>[] = [];
  try {
    filas = await getSheetData('OPINIONES');
  } catch {
    return NextResponse.json({ opiniones: [], promedios: null, total: 0 });
  }

  const opiniones = filas
    .map((o) => ({
      id: o.ID_Opinion,
      idPedido: o.ID_Pedido,
      cliente: (o.Anonimo || '').toLowerCase() === 'si' ? 'Anónimo' : o.Nombre_Cliente || 'Cliente',
      anonimo: (o.Anonimo || '').toLowerCase() === 'si',
      sabor: parseInt(o.Sabor) || 0,
      calidad: parseInt(o.Calidad) || 0,
      comentario: o.Comentario || '',
      fecha: o.Fecha || '',
      orden: parsearFechaHora(o.Fecha)?.timestamp ?? 0,
    }))
    .sort((a, b) => b.orden - a.orden);

  const n = opiniones.length;
  const promedios = n
    ? {
        sabor: opiniones.reduce((s, o) => s + o.sabor, 0) / n,
        calidad: opiniones.reduce((s, o) => s + o.calidad, 0) / n,
      }
    : null;

  return NextResponse.json({ opiniones, promedios, total: n });
}
