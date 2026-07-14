/**
 * app/api/admin/ventas/terminal/route.ts
 *
 * Cobro con la terminal física (Point) desde el punto de venta.
 *
 * POST   → inicia el cobro: manda el monto a la terminal y devuelve el
 *          id de la intención de pago.
 * GET    → ?intentId=  consulta el estado del cobro (para hacer polling).
 * DELETE → ?intentId=&deviceId=  cancela un cobro pendiente.
 *
 * La venta NO se registra aquí: el punto de venta espera a que este
 * cobro se apruebe y solo entonces llama a /api/admin/ventas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/roles';
import {
  cancelarIntentoPagoPoint,
  crearIntentoPagoPoint,
  obtenerDeviceIdPoint,
  obtenerIntentoPagoPoint,
} from '@/lib/mercadoPago';

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { total } = await req.json();
  const monto = parseFloat(total);
  if (isNaN(monto) || monto <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  const deviceId = await obtenerDeviceIdPoint();
  if (!deviceId) {
    return NextResponse.json(
      { error: 'No hay una terminal Point disponible. Revisa que esté encendida, con internet y en modo integrado.' },
      { status: 400 }
    );
  }

  const externalReference = `POS-${Date.now()}`;
  const intento = await crearIntentoPagoPoint(deviceId, monto, externalReference);
  if (intento.error || !intento.id) {
    return NextResponse.json({ error: intento.error || 'No se pudo iniciar el cobro' }, { status: 400 });
  }

  return NextResponse.json({ intentId: intento.id, deviceId });
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const intentId = new URL(req.url).searchParams.get('intentId');
  if (!intentId) {
    return NextResponse.json({ error: 'Falta intentId' }, { status: 400 });
  }

  const estado = await obtenerIntentoPagoPoint(intentId);
  return NextResponse.json(estado);
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const intentId = searchParams.get('intentId');
  const deviceId = searchParams.get('deviceId');
  if (!intentId || !deviceId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const ok = await cancelarIntentoPagoPoint(deviceId, intentId);
  return NextResponse.json({ success: ok });
}
