/**
 * app/api/admin/ajustes/route.ts
 *
 * Ajustes del negocio configurables desde el panel.
 * GET  → valores actuales
 * POST → { topeArticuloGratis?, ordenCategorias? } (se manda solo lo que cambió)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CLAVE_TOPE_ARTICULO,
  guardarAjuste,
  guardarOrdenCategorias,
  leerAjustes,
} from '@/lib/ajustes';
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

  const { topeArticuloGratis, ordenCategorias } = await req.json();

  if (topeArticuloGratis !== undefined) {
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
  }

  if (ordenCategorias !== undefined) {
    if (!Array.isArray(ordenCategorias) || ordenCategorias.some((c) => typeof c !== 'string')) {
      return NextResponse.json({ error: 'Orden de grupos inválido' }, { status: 400 });
    }
    await guardarOrdenCategorias(ordenCategorias);
  }

  return NextResponse.json({ success: true, ajustes: await leerAjustes() });
}
