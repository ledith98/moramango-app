/**
 * app/api/admin/cuenta/route.ts
 *
 * El dinero que vive en la cuenta de Mercado Pago, no en el cajón.
 * GET  ?desde=&hasta= → lo que entró por ventas, el rendimiento y las salidas
 * POST → { accion: 'movimiento', tipo, monto, motivo, fechaISO? }
 *        { accion: 'borrar', fila }
 */

import { NextRequest, NextResponse } from 'next/server';
import { borrarMovimiento, CUENTA_DIGITAL, registrarMovimiento, type TipoMovimiento } from '@/lib/caja';
import { leerCuenta, rendimientoAnual } from '@/lib/cuenta';
import { fechaHoyMTY } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

/** Primer día del mes en curso: es el rango que se usa casi siempre. */
const primerDiaDelMes = () => fechaHoyMTY().slice(0, 8) + '01';

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const q = new URL(req.url).searchParams;
  const desde = ES_FECHA.test(q.get('desde') ?? '') ? q.get('desde')! : primerDiaDelMes();
  const hasta = ES_FECHA.test(q.get('hasta') ?? '') ? q.get('hasta')! : fechaHoyMTY();
  if (desde > hasta) {
    return NextResponse.json({ error: 'La fecha de inicio va antes que la del final' }, { status: 400 });
  }

  const estado = await leerCuenta(desde, hasta);

  // El saldo lo escribe ella (es lo que dice la app del banco); sin él no
  // se puede sacar la tasa, porque el mismo rendimiento en pesos significa
  // cosas distintas segun cuanto dinero haya parado.
  const saldo = parseFloat(q.get('saldo') ?? '');
  const tasaAnual = isFinite(saldo)
    ? rendimientoAnual(estado.rendimiento, saldo, estado.dias)
    : null;

  return NextResponse.json({ ...estado, tasaAnual });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = (session.user as { name?: string }).name || '';
  const { accion, tipo, monto, motivo, fechaISO, fila } = await req.json();

  if (accion === 'borrar') {
    const n = parseInt(fila, 10);
    if (!Number.isInteger(n) || n < 2) {
      return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    }
    await borrarMovimiento(n);
    return NextResponse.json({ success: true });
  }

  if (accion !== 'movimiento') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }

  const cantidad = parseFloat(monto);
  if (isNaN(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Escribe de cuánto fue' }, { status: 400 });
  }
  const clase: TipoMovimiento =
    tipo === 'Entrada' ? 'Entrada' : tipo === 'Rendimiento' ? 'Rendimiento' : 'Salida';

  // El motivo es obligatorio salvo en el rendimiento, que se explica solo:
  // un movimiento sin explicacion es justo el descuadre que se quiere evitar.
  const texto = (motivo ?? '').toString().trim();
  if (clase !== 'Rendimiento' && !texto) {
    return NextResponse.json({ error: 'Escribe en qué fue' }, { status: 400 });
  }

  const fecha = ES_FECHA.test((fechaISO ?? '').toString()) ? fechaISO : fechaHoyMTY();
  if (fecha > fechaHoyMTY()) {
    return NextResponse.json({ error: 'La fecha no puede ser futura' }, { status: 400 });
  }

  await registrarMovimiento(
    clase,
    cantidad,
    texto || 'Rendimiento de la cuenta',
    quien,
    fecha,
    CUENTA_DIGITAL
  );
  return NextResponse.json({ success: true });
}
