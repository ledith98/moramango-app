/**
 * app/api/admin/jugo-del-dia/route.ts
 *
 * GET    → jugo del día actual + lista de jugos del menú (para el menú
 *          desplegable) y las frutas con stock (para sugerir).
 * POST   → { jugo, nota } fija el jugo del día y avisa a Telegram.
 * DELETE → quita el jugo del día.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { guardarJugoDelDia, leerJugoDelDia, limpiarJugoDelDia } from '@/lib/jugoDelDia';
import { getAdminSession } from '@/lib/roles';
import { enviarTelegram } from '@/lib/telegram';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const [actual, productos] = await Promise.all([
    leerJugoDelDia(),
    getSheetData('Productos', { crudo: true }),
  ]);

  // Jugos del menú, para elegir de una lista en vez de escribir
  const jugos = productos
    .filter((p) => p.ID_Producto && (p.Eliminado || '').toUpperCase() !== 'TRUE')
    .filter((p) => /jugo/i.test(p['Categoría'] || p.Categoria || ''))
    .map((p) => (p.Nombre || '').replace(/^jugo de\s+/i, '').trim())
    .filter(Boolean);

  return NextResponse.json({ actual, jugos: [...new Set(jugos)] });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { jugo, nota } = await req.json();
  if (!jugo || !jugo.toString().trim()) {
    return NextResponse.json({ error: 'Escribe cuál es el jugo del día' }, { status: 400 });
  }

  await guardarJugoDelDia(jugo.toString(), (nota || '').toString());

  await enviarTelegram(
    `🥤 <b>Jugo del día:</b> ${jugo.toString().trim()}` +
      (nota && nota.toString().trim() ? `\n<i>${nota.toString().trim()}</i>` : '')
  );

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await limpiarJugoDelDia();
  return NextResponse.json({ success: true });
}
