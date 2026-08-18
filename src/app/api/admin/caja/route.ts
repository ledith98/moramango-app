/**
 * app/api/admin/caja/route.ts
 *
 * Corte de caja del día.
 * GET  → estado de hoy (fondo, ventas efectivo, esperado, contado, diferencia)
 * POST → { accion: 'abrir', fondo } | { accion: 'corte', contado, notas }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  abrirCaja,
  borrarMovimiento,
  cerrarCaja,
  leerCaja,
  leerMovimientos,
  registrarMovimiento,
} from '@/lib/caja';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
  return NextResponse.json({ ...estado, movimientos });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = (session.user as { name?: string }).name || '';
  const { accion, fondo, contado, notas, tipo, monto, motivo, fila } = await req.json();

  // Dinero que sale o entra de la caja sin ser una venta
  if (accion === 'movimiento') {
    const cantidad = parseFloat(monto);
    if (isNaN(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: 'Escribe de cuánto fue' }, { status: 400 });
    }
    const razon = (motivo || '').toString().trim();
    if (!razon) {
      // Sin motivo, el movimiento es indistinguible del descuadre que
      // este apartado existe para evitar
      return NextResponse.json({ error: 'Escribe para qué fue' }, { status: 400 });
    }
    await registrarMovimiento(tipo === 'Entrada' ? 'Entrada' : 'Salida', cantidad, razon, quien);
    const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
    return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
  }

  if (accion === 'borrarMovimiento') {
    const n = parseInt(fila, 10);
    if (isNaN(n) || n < 2) {
      return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    }
    await borrarMovimiento(n);
    const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
    return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
  }

  if (accion === 'abrir') {
    const monto = parseFloat(fondo);
    if (isNaN(monto) || monto < 0) {
      return NextResponse.json({ error: 'Escribe el fondo de apertura' }, { status: 400 });
    }
    await abrirCaja(monto, quien);
    const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
    return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
  }

  if (accion === 'corte') {
    const monto = parseFloat(contado);
    if (isNaN(monto) || monto < 0) {
      return NextResponse.json({ error: 'Escribe el efectivo contado' }, { status: 400 });
    }
    try {
      const estado = await cerrarCaja(monto, quien, (notas || '').toString());
      const movimientos = await leerMovimientos();
      return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}
