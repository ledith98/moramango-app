/**
 * app/api/admin/corte/route.ts
 *
 * GET  → devuelve el corte del día en texto, para verlo en el panel.
 * POST → lo manda por Telegram.
 *
 * Sirve para las dos formas de usarlo: el botón "mándamelo ahora" y la
 * tarea programada de Vercel que lo dispara sola al cerrar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cerrarCajaSinContar } from '@/lib/caja';
import { armarCorteDelDia } from '@/lib/corteDia';
import { fechaHoyMTY } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';
import { enviarTelegram } from '@/lib/telegram';

/**
 * La tarea programada de Vercel no trae sesión de administrador, así que
 * se identifica con su encabezado. Cualquier otra llamada sí exige sesión:
 * el corte lleva las ventas del día y no puede quedar abierto.
 */
function esCron(req: NextRequest): boolean {
  return (
    req.headers.get('x-vercel-cron') !== null ||
    (!!process.env.CRON_SECRET &&
      req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`)
  );
}

async function permitido(req: NextRequest): Promise<boolean> {
  if (esCron(req)) return true;
  return !!(await getAdminSession());
}

export async function GET(req: NextRequest) {
  if (!(await permitido(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const fecha = new URL(req.url).searchParams.get('fecha') || fechaHoyMTY();
  const texto = await armarCorteDelDia(fecha);

  /**
   * La tarea programada de Vercel siempre llama con GET, así que el cierre
   * y el envío tienen que pasar aquí: si solo lo hiciera el POST, el corte
   * automático se generaría cada noche y no llegaría a ningún lado.
   *
   * Se cierra la caja SIN inventar el efectivo contado. Poner ahí lo
   * esperado haría que todos los días cuadraran perfecto, y el corte
   * dejaría de servir para lo único que sirve: ver cuándo falta dinero.
   * Si alguien ya la cerró contando, no se toca.
   */
  if (esCron(req)) {
    let cerroSola = false;
    try {
      cerroSola = await cerrarCajaSinContar(
        'Cerró sola a la hora de cierre; nadie contó el efectivo'
      );
    } catch (e) {
      console.error('No se pudo cerrar la caja sola:', e);
    }

    if (!texto) return NextResponse.json({ enviado: false, cerroSola });

    const aviso = cerroSola
      ? `${texto}

🔒 <b>La caja se cerró sola</b>
   Nadie contó el efectivo, así que el corte no dice si cuadra. Cuéntalo y anótalo en Dinero.`
      : texto;
    await enviarTelegram(aviso);
    return NextResponse.json({ enviado: true, cerroSola });
  }

  return NextResponse.json({ fecha, corte: texto, huboVentas: texto !== null });
}

export async function POST(req: NextRequest) {
  if (!(await permitido(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const texto = await armarCorteDelDia();
  if (!texto) {
    // Un día sin ventas no manda nada: avisar "vendiste $0" cada domingo
    // entrena a ignorar los avisos que sí importan.
    return NextResponse.json({ success: true, enviado: false, motivo: 'Hoy no hubo ventas' });
  }

  await enviarTelegram(texto);
  return NextResponse.json({ success: true, enviado: true });
}
