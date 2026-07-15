/**
 * app/api/mp/webhook/route.ts
 *
 * Webhook público de Mercado Pago. MP lo llama cuando hay actividad en
 * un pago (creado, aprobado, rechazado...).
 *
 * Seguridad: NO se confía en el payload recibido. Solo se extrae el id
 * del pago y se consulta directamente a la API de MP con nuestro token;
 * únicamente si MP confirma status='approved' se marca el pedido como
 * pagado. Un webhook falsificado no puede fingir un pago aprobado.
 *
 * Siempre responde 200: si respondemos otra cosa, MP reintenta la
 * notificación una y otra vez.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureColumn, findRow, updateCell } from '@/lib/googleSheets';
import { obtenerPago } from '@/lib/mercadoPago';
import { enviarTelegram } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // El id del pago puede venir en el body (webhooks) o en la query (IPN)
    let idPago: string | null = null;

    const body = await req.json().catch(() => null);
    if (body?.data?.id) idPago = String(body.data.id);
    if (!idPago) idPago = searchParams.get('data.id') || searchParams.get('id');

    // Solo nos interesan notificaciones de pagos
    const tipo = body?.type || searchParams.get('type') || searchParams.get('topic') || '';
    if (!idPago || (tipo && tipo !== 'payment')) {
      return NextResponse.json({ ok: true });
    }

    const pago = await obtenerPago(idPago);
    if (!pago || pago.status !== 'approved' || !pago.external_reference) {
      return NextResponse.json({ ok: true });
    }

    const pedidoRow = await findRow('PEDIDOS', 'ID_Pedido', pago.external_reference);
    if (!pedidoRow) {
      console.error(`Webhook MP: pedido ${pago.external_reference} no encontrado`);
      return NextResponse.json({ ok: true });
    }

    // Si ya estaba marcado como pagado, no volver a avisar (MP puede
    // reenviar la misma notificación varias veces)
    const yaEstabaPagado = pedidoRow.data.Estado_Pago === 'Pagado';

    const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
    await updateCell('PEDIDOS', pedidoRow.rowIndex, colEstadoPago, 'Pagado');

    const colMetodo = await ensureColumn('PEDIDOS', 'Metodo_Pago');
    await updateCell('PEDIDOS', pedidoRow.rowIndex, colMetodo, 'Mercado Pago');

    // Segundo aviso: el primero salió al crear el pedido diciendo que el
    // pago estaba pendiente; este confirma que el dinero sí entró.
    if (!yaEstabaPagado) {
      const total = parseFloat(pedidoRow.data.Total_Final) || 0;
      await enviarTelegram(
        `✅ <b>Pago confirmado</b> — ${pago.external_reference}\n` +
          `👤 ${pedidoRow.data.Nombre_Cliente_Snap || 'Cliente'}\n` +
          `💳 Mercado Pago — <b>$${total.toFixed(2)}</b>`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error en webhook MP:', error);
    // 200 igualmente — el error queda en logs y MP no reintenta en bucle
    return NextResponse.json({ ok: true });
  }
}
