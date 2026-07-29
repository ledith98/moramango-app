/**
 * app/api/admin/ajustes/route.ts
 *
 * Ajustes del negocio configurables desde el panel.
 * GET  → valores actuales
 * POST → { topeArticuloGratis }
 */

import { NextRequest, NextResponse } from 'next/server';
import { CLAVE_TOPE_ARTICULO, guardarAjuste, leerAjustes } from '@/lib/ajustes';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return NextResponse.json(await leerAjustes());
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { topeArticuloGratis } = await req.json();
  const tope = parseFloat(topeArticuloGratis);
  if (isNaN(tope) || tope <= 0) {
    return NextResponse.json(
      { error: 'El tope debe ser un monto mayor a 0' },
      { status: 400 }
    );
  }

  await guardarAjuste(
    CLAVE_TOPE_ARTICULO,
    Math.round(tope * 100) / 100,
    'Precio máximo del artículo gratis de la décima compra'
  );

  return NextResponse.json({ success: true, ajustes: await leerAjustes() });
}
