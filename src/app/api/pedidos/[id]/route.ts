/**
 * app/api/pedidos/[id]/route.ts
 *
 * Acciones que el propio cliente puede hacer sobre SU pedido:
 *
 * POST { accion: 'pagar' }    → genera un nuevo checkout de Mercado Pago
 *                               para liquidar un pedido que quedó pendiente
 *                               (ej. se salió del pago y no lo completó).
 * POST { accion: 'cancelar' } → cancela su propio pedido.
 *
 * Reglas de seguridad: el pedido debe ser suyo. Solo puede cancelar si
 * aún no se prepara y no está pagado; si ya pagó, el dinero requiere un
 * reembolso y eso lo hace el negocio (no se puede autocancelar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { ensureColumn, findRow, updateCell } from '@/lib/googleSheets';
import { baseUrlDesdeRequest, crearPreferencia, mpConfigurado } from '@/lib/mercadoPago';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const { id } = await context.params;
  const { accion } = await req.json();
  const idUsuario = (session.user as any).id_usuario;

  const pedidoRow = await findRow('PEDIDOS', 'ID_Pedido', id);
  if (!pedidoRow) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  // Solo sobre pedidos propios
  if (pedidoRow.data.ID_Usuario !== idUsuario) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const estado = pedidoRow.data.Estado || '';
  const estadoPago = pedidoRow.data.Estado_Pago || '';

  if (estado === 'Cancelado') {
    return NextResponse.json({ error: 'Este pedido ya está cancelado' }, { status: 400 });
  }

  // ── Liquidar un pago pendiente ──
  if (accion === 'pagar') {
    if (estadoPago === 'Pagado') {
      return NextResponse.json({ error: 'Este pedido ya está pagado' }, { status: 400 });
    }
    if (!mpConfigurado()) {
      return NextResponse.json({ error: 'El pago en línea no está disponible' }, { status: 400 });
    }

    const total = parseFloat(pedidoRow.data.Total_Final) || 0;
    if (total <= 0) {
      return NextResponse.json({ error: 'Total inválido' }, { status: 400 });
    }

    const preferencia = await crearPreferencia({
      idPedido: id,
      descripcion: `Pedido Moramango ${id}`,
      total,
      baseUrl: baseUrlDesdeRequest(req),
    });
    if (!preferencia) {
      return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 400 });
    }

    // Queda pendiente hasta que el webhook confirme
    const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
    await updateCell('PEDIDOS', pedidoRow.rowIndex, colEstadoPago, 'Pendiente');

    return NextResponse.json({ success: true, checkoutUrl: preferencia.checkoutUrl });
  }

  // ── Cancelar su propio pedido ──
  if (accion === 'cancelar') {
    if (estadoPago === 'Pagado') {
      return NextResponse.json(
        { error: 'Este pedido ya está pagado. Contáctanos para un reembolso.' },
        { status: 400 }
      );
    }
    if (estado !== 'Recibido') {
      return NextResponse.json(
        { error: 'Tu pedido ya se está preparando. Contáctanos para cancelarlo.' },
        { status: 400 }
      );
    }

    // Columna 5 = Estado en la hoja PEDIDOS
    await updateCell('PEDIDOS', pedidoRow.rowIndex, 5, 'Cancelado');
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}
