/**
 * app/api/admin/usuarios/[id]/pedidos/route.ts
 *
 * GET → Historial de pedidos de un cliente específico, más reciente primero
 */

import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await context.params;

  const pedidos = await getSheetData('PEDIDOS');
  const delCliente = pedidos
    .filter((p) => p.ID_Usuario === id)
    .sort((a, b) => {
      const ta = parsearFechaHora(a.Fecha_Hora)?.timestamp ?? 0;
      const tb = parsearFechaHora(b.Fecha_Hora)?.timestamp ?? 0;
      return tb - ta;
    });

  return NextResponse.json({ pedidos: delCliente });
}
