/**
 * app/api/admin/respaldo/route.ts
 *
 * La copia de seguridad de la hoja de cálculo.
 *
 * GET  → los respaldos que hay guardados
 * POST → hace uno ahora
 *
 * La tarea programada de Vercel lo llama con GET cada madrugada, igual que
 * el corte: llega sin sesión y se identifica por su encabezado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { hacerRespaldo, listarRespaldos, respaldoListo, DIAS_QUE_SE_GUARDAN } from '@/lib/respaldo';
import { getAdminSession } from '@/lib/roles';

/**
 * Leer 19 pestañas tarda unos 7 segundos, y el límite normal de Vercel es
 * 10. Con margen: si un día la hoja crece, el respaldo no se corta a la
 * mitad justo el día que más falta hace.
 */
export const maxDuration = 60;

/** La tarea programada no trae sesión; se identifica por su encabezado. */
function esCron(req: NextRequest): boolean {
  return (
    req.headers.get('x-vercel-cron') !== null ||
    (!!process.env.CRON_SECRET &&
      req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`)
  );
}

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

export async function GET(req: NextRequest) {
  const cron = esCron(req);
  const sesion = cron ? null : await getAdminSession();
  if (!cron && !sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  if (!respaldoListo()) {
    return NextResponse.json({ listo: false, respaldos: [], dias: DIAS_QUE_SE_GUARDAN });
  }

  /**
   * La tarea programada entra por GET —es lo único que Vercel sabe hacer—
   * así que aquí es donde se genera la copia de cada madrugada.
   */
  if (cron) {
    try {
      const r = await hacerRespaldo();
      console.log(`Respaldo ${r.nombre}: ${r.filas} filas, ${r.bytes} bytes, ${r.borrados} viejos borrados`);
      return NextResponse.json({ ok: true, ...r });
    } catch (error) {
      console.error('Falló el respaldo automático:', error);
      return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({
    listo: true,
    dias: DIAS_QUE_SE_GUARDAN,
    respaldos: await listarRespaldos(),
  });
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  void req;

  if (!respaldoListo()) {
    return NextResponse.json(
      { error: 'Falta el almacenamiento de la app para poder guardar el respaldo.' },
      { status: 503 }
    );
  }

  try {
    const r = await hacerRespaldo();
    await anotar(
      quienDe(sesion),
      'Ajustes',
      'Hizo un respaldo de la información',
      `${r.pestanas} pestañas, ${r.filas} filas`
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    console.error('Falló el respaldo:', error);
    return NextResponse.json(
      { error: 'No se pudo hacer el respaldo. Inténtalo de nuevo en un momento.' },
      { status: 500 }
    );
  }
}
