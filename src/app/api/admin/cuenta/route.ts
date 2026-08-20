/**
 * app/api/admin/cuenta/route.ts
 *
 * El dinero que vive en la cuenta de Mercado Pago, no en el cajón.
 * GET  ?desde=&hasta= → lo que entró por ventas, el rendimiento y las salidas
 * POST → { accion: 'movimiento', tipo, monto, motivo, fechaISO? }
 *        { accion: 'borrar', fila }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  borrarMovimiento,
  CUENTA_DIGITAL,
  CUENTA_EFECTIVO,
  registrarMovimiento,
  type TipoMovimiento,
} from '@/lib/caja';
import { guardarSaldo, leerCuenta } from '@/lib/cuenta';
import { fechaHoyMTY } from '@/lib/pedidoFecha';
import { anotar } from '@/lib/bitacora';
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

  // La tasa se calcula en la pantalla (rendimiento.ts es puro): asi el
  // porcentaje cambia mientras se escribe el saldo, sin un viaje al
  // servidor por cada tecla.
  return NextResponse.json(await leerCuenta(desde, hasta));
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = (session.user as { name?: string }).name || '';
  const { accion, tipo, monto, motivo, fechaISO, fila, cuenta } = await req.json();

  // El saldo real, copiado de la app del banco. Se guarda con la fecha en
  // que se tomo: sin ella, un saldo de hace tres semanas se ve igual de
  // confiable que el de hoy.
  if (accion === 'saldo') {
    const valor = parseFloat(monto);
    if (isNaN(valor) || valor < 0) {
      return NextResponse.json({ error: 'Escribe cuánto tienes en la cuenta' }, { status: 400 });
    }
    const cuando = ES_FECHA.test((fechaISO ?? '').toString()) ? fechaISO : fechaHoyMTY();
    await guardarSaldo(valor, cuando);
    await anotar(quien, 'Cuenta', `Anotó el saldo de la cuenta: $${valor.toFixed(2)}`, `al ${cuando}`);
    return NextResponse.json({ success: true });
  }

  if (accion === 'borrar') {
    const n = parseInt(fila, 10);
    if (!Number.isInteger(n) || n < 2) {
      return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    }
    await borrarMovimiento(n);
    await anotar(quien, 'Cuenta', 'Borró un movimiento', `fila ${n}`);
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

  // De qué bolsa salió (o entró) el dinero. El rendimiento solo existe en
  // la cuenta: el efectivo del cajón no genera intereses.
  const bolsa = cuenta === CUENTA_EFECTIVO && clase !== 'Rendimiento' ? CUENTA_EFECTIVO : CUENTA_DIGITAL;

  await registrarMovimiento(
    clase,
    cantidad,
    texto || 'Rendimiento de la cuenta',
    quien,
    fecha,
    bolsa
  );
  await anotar(
    quien,
    bolsa === CUENTA_EFECTIVO ? 'Caja' : 'Cuenta',
    `${clase === 'Salida' ? 'Sacó' : clase === 'Entrada' ? 'Metió' : 'Anotó rendimiento de'} $${cantidad.toFixed(2)}`,
    [texto, `fecha ${fecha}`, bolsa === CUENTA_EFECTIVO ? 'del cajón' : 'de la cuenta'].filter(Boolean).join(' · ')
  );
  return NextResponse.json({ success: true });
}
