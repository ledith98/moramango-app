/**
 * app/api/admin/caja/route.ts
 *
 * Corte de caja del día.
 * GET  → estado de hoy (fondo, ventas efectivo, esperado, contado, diferencia)
 * POST → { accion: 'abrir', fondo } | { accion: 'corte', contado, notas }
 */

import { NextRequest, NextResponse } from 'next/server';
import { abrirCaja, cerrarCaja, leerCaja } from '@/lib/caja';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return NextResponse.json(await leerCaja());
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = (session.user as { name?: string }).name || '';
  const { accion, fondo, contado, notas } = await req.json();

  if (accion === 'abrir') {
    const monto = parseFloat(fondo);
    if (isNaN(monto) || monto < 0) {
      return NextResponse.json({ error: 'Escribe el fondo de apertura' }, { status: 400 });
    }
    await abrirCaja(monto, quien);
    return NextResponse.json({ success: true, estado: await leerCaja() });
  }

  if (accion === 'corte') {
    const monto = parseFloat(contado);
    if (isNaN(monto) || monto < 0) {
      return NextResponse.json({ error: 'Escribe el efectivo contado' }, { status: 400 });
    }
    try {
      const estado = await cerrarCaja(monto, quien, (notas || '').toString());
      return NextResponse.json({ success: true, estado });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}
