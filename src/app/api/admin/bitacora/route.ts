/**
 * app/api/admin/bitacora/route.ts
 *
 * Quién cambió qué. Solo lectura: la bitácora se escribe sola desde cada
 * operación, nunca a mano — un registro que se puede editar no sirve de
 * registro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { leerBitacora } from '@/lib/bitacora';
import { getAdminSession } from '@/lib/roles';

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const limite = parseInt(new URL(req.url).searchParams.get('limite') ?? '200', 10);
  return NextResponse.json({
    movimientos: await leerBitacora(Number.isFinite(limite) ? Math.min(limite, 500) : 200),
  });
}
