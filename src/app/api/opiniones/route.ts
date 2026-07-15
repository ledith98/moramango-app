/**
 * app/api/opiniones/route.ts
 *
 * POST → El cliente califica un pedido suyo (sabor y calidad del pedido
 *        completo) y opcionalmente deja un comentario.
 *
 * Diseño: la opinión SIEMPRE queda ligada al pedido, aunque el cliente
 * pida ocultar su nombre. Así se sabe qué se calificó y que la persona
 * de verdad compró; "anónimo" solo significa que su nombre no se
 * muestra, no que se pierda el contexto.
 *
 * Reglas: solo pedidos propios, solo si ya fueron Entregados y solo una
 * opinión por pedido.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { appendRow, ensureSheet, findRow, getSheetData } from '@/lib/googleSheets';
import { enviarTelegram } from '@/lib/telegram';

export const COLUMNAS_OPINIONES = [
  'ID_Opinion',
  'ID_Pedido',
  'ID_Usuario',
  'Nombre_Cliente',
  'Anonimo',
  'Sabor',
  'Calidad',
  'Comentario',
  'Fecha',
];

const valida = (n: unknown) => {
  const v = parseInt(String(n));
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const { idPedido, sabor, calidad, comentario, anonimo } = await req.json();
  const idUsuario = (session.user as any).id_usuario;

  const notaSabor = valida(sabor);
  const notaCalidad = valida(calidad);
  if (!idPedido || notaSabor === null || notaCalidad === null) {
    return NextResponse.json({ error: 'Califica el sabor y la calidad (1 a 5)' }, { status: 400 });
  }

  const pedidoRow = await findRow('PEDIDOS', 'ID_Pedido', idPedido);
  if (!pedidoRow) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }
  if (pedidoRow.data.ID_Usuario !== idUsuario) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (pedidoRow.data.Estado !== 'Entregado') {
    return NextResponse.json(
      { error: 'Podrás opinar cuando recibas tu pedido' },
      { status: 400 }
    );
  }

  await ensureSheet('OPINIONES', COLUMNAS_OPINIONES);

  // Una sola opinión por pedido
  const existentes = await getSheetData('OPINIONES');
  if (existentes.some((o) => o.ID_Pedido === idPedido)) {
    return NextResponse.json({ error: 'Ya calificaste este pedido. ¡Gracias!' }, { status: 400 });
  }

  const ahora = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
  const idOpinion = `OPI-${String(existentes.length + 1).padStart(4, '0')}`;
  const texto = (comentario || '').toString().trim().slice(0, 500);

  await appendRow('OPINIONES', [
    idOpinion,
    idPedido,
    idUsuario,
    pedidoRow.data.Nombre_Cliente_Snap || '',
    anonimo ? 'si' : 'no',
    notaSabor,
    notaCalidad,
    texto,
    ahora,
  ]);

  // Avisar solo si algo salió mal (3 o menos): eso sí requiere atención
  const promedio = (notaSabor + notaCalidad) / 2;
  if (promedio <= 3) {
    try {
      await enviarTelegram(
        `⚠️ <b>Opinión baja</b> — ${idPedido}\n` +
          `Sabor: ${'⭐'.repeat(notaSabor)} (${notaSabor}/5)\n` +
          `Calidad: ${'⭐'.repeat(notaCalidad)} (${notaCalidad}/5)` +
          (texto ? `\n📝 "${texto}"` : '')
      );
    } catch (e) {
      console.error('Error avisando opinión baja:', e);
    }
  }

  return NextResponse.json({ success: true });
}
