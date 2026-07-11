/**
 * app/api/admin/telegram/route.ts
 *
 * GET  → Estado de la configuración de avisos por Telegram + chats que
 *        le han escrito al bot (para descubrir el chat id en el setup).
 * POST → { accion: 'test' } manda un mensaje de prueba a los chat id
 *        configurados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/roles';
import {
  detectarChats,
  enviarTelegram,
  telegramConfigurado,
  tieneDestinatarios,
} from '@/lib/telegram';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const configurado = telegramConfigurado();
  const chats = configurado ? await detectarChats() : [];

  return NextResponse.json({
    botConfigurado: configurado,
    tieneDestinatarios: tieneDestinatarios(),
    chats,
  });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { accion } = await req.json();
  if (accion !== 'test') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }

  if (!telegramConfigurado()) {
    return NextResponse.json({ error: 'Falta configurar TELEGRAM_BOT_TOKEN' }, { status: 400 });
  }
  if (!tieneDestinatarios()) {
    return NextResponse.json({ error: 'Falta configurar TELEGRAM_CHAT_ID' }, { status: 400 });
  }

  await enviarTelegram('✅ Prueba de avisos Moramango. Si ves esto, los avisos de pedidos ya funcionan.');
  return NextResponse.json({ success: true });
}
