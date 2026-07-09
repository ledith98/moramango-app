/**
 * app/api/admin/usuarios/[id]/pedidos/route.ts
 *
 * GET → Historial de pedidos de un cliente específico, más reciente primero
 */

import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { extraerFechaPedido } from '@/lib/pedidoFecha';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const pedidos = await getSheetData('PEDIDOS');
  const delCliente = pedidos
    .filter((p) => p.ID_Usuario === id)
    .sort((a, b) => {
      const ta = extraerFechaPedido(a.ID_Pedido)?.timestamp ?? 0;
      const tb = extraerFechaPedido(b.ID_Pedido)?.timestamp ?? 0;
      return tb - ta;
    });

  return NextResponse.json({ pedidos: delCliente });
}
