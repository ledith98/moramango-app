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
import { anotar } from '@/lib/bitacora';
import { getSheetData } from '@/lib/googleSheets';
import { estaEnUso, HOJA_ACTIVOS, HOJA_BIBLIOTECA } from '@/lib/inventario';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const [estado, movimientos, biblioteca, activos] = await Promise.all([
    leerCaja(),
    leerMovimientos(),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }).catch(() => []),
    getSheetData(HOJA_ACTIVOS, { crudo: true }).catch(() => []),
  ]);

  // Los insumos que se usan hoy, para poder decir en qué se fue el dinero
  // sin escribirlo a mano. Solo nombre e id: la pantalla no necesita más.
  const enUso = new Set(
    activos.filter((a) => estaEnUso(a.En_Uso)).map((a) => a.ID_Biblioteca)
  );
  const insumos = biblioteca
    .filter(
      (b) =>
        b.ID_Biblioteca &&
        (b.Nombre || '').trim() &&
        (b.Eliminado || '').toLowerCase() !== 'si' &&
        enUso.has(b.ID_Biblioteca)
    )
    .map((b) => ({ id: b.ID_Biblioteca, nombre: b.Nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return NextResponse.json({ ...estado, movimientos, insumos });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = (session.user as { name?: string }).name || '';
  const { accion, fondo, contado, notas, tipo, monto, motivo, fila, idInsumo } = await req.json();

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
    // Si el dinero se fue en un insumo, el movimiento queda ligado a él.
    // No se registra la compra aquí: eso necesita cuántos kilos llegaron,
    // que es justo lo que esta pantalla no pregunta. Se ofrece el atajo
    // para ir a capturarla, y así no hay dos caminos que creen el mismo
    // registro por separado.
    const insumo = (idInsumo || '').toString().trim();
    await registrarMovimiento(
      tipo === 'Entrada' ? 'Entrada' : 'Salida',
      cantidad,
      razon,
      quien,
      undefined,
      undefined,
      insumo
    );
    await anotar(
      quien,
      'Caja',
      `${tipo === 'Entrada' ? 'Metió' : 'Sacó'} $${cantidad.toFixed(2)} del cajón`,
      razon
    );
    const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
    return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
  }

  if (accion === 'borrarMovimiento') {
    const n = parseInt(fila, 10);
    if (isNaN(n) || n < 2) {
      return NextResponse.json({ error: 'Movimiento inválido' }, { status: 400 });
    }
    await borrarMovimiento(n);
    await anotar(quien, 'Caja', 'Borró un movimiento de efectivo', `fila ${n}`);
    const [estado, movimientos] = await Promise.all([leerCaja(), leerMovimientos()]);
    return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
  }

  if (accion === 'abrir') {
    const monto = parseFloat(fondo);
    if (isNaN(monto) || monto < 0) {
      return NextResponse.json({ error: 'Escribe el fondo de apertura' }, { status: 400 });
    }
    await abrirCaja(monto, quien);
    await anotar(quien, 'Caja', `Abrió la caja con $${monto.toFixed(2)}`);
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
      await anotar(
        quien,
        'Caja',
        `Cerró la caja: contó $${monto.toFixed(2)}`,
        [
          estado.esperado !== null ? `esperado $${estado.esperado.toFixed(2)}` : '',
          estado.diferencia !== null && estado.diferencia !== 0
            ? `${estado.diferencia > 0 ? 'sobró' : 'faltó'} $${Math.abs(estado.diferencia).toFixed(2)}`
            : 'cuadró',
          (notas || '').toString().trim(),
        ]
          .filter(Boolean)
          .join(' · ')
      );
      const movimientos = await leerMovimientos();
      return NextResponse.json({ success: true, estado: { ...estado, movimientos } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}
