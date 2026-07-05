/**
 * app/api/pedidos/route.ts
 *
 * Maneja dos operaciones:
 *
 * GET  → Devuelve los pedidos del usuario logueado (solo los suyos)
 * POST → Crea un pedido nuevo en PEDIDOS y DT PEDIDOS,
 *        y actualiza el programa de lealtad en USUARIOS
 *
 * No requiere ser admin — cualquier cliente logueado puede usarlo.
 * Sí requiere estar logueado — sin sesión devuelve 401.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { appendRow, getSheetData, findRow, updateCell } from '@/lib/googleSheets';

// ── GET: pedidos del usuario actual ──────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const idUsuario = (session.user as any).id_usuario;
  const todos = await getSheetData('PEDIDOS');
  const misPedidos = todos.filter((p) => p.ID_Usuario === idUsuario);

  return NextResponse.json({ pedidos: misPedidos });
}

// ── POST: crear pedido nuevo ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const { items, notas, horaRecoleccion, beneficioCanjeado } = await req.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
  }

  const usuario = session.user as any;
  const ahora = new Date();
  const fechaStr = ahora.toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
  const fechaId = ahora.toISOString().slice(0, 10).replace(/-/g, '');

  // ID de pedido legible: PED-20250701-001
  const pedidosExistentes = await getSheetData('PEDIDOS');
  const delMismoDia = pedidosExistentes.filter((p) =>
    p.ID_Pedido?.includes(fechaId)
  ).length;
  const idPedido = `PED-${fechaId}-${String(delMismoDia + 1).padStart(3, '0')}`;

  // Calcular totales
  const totalBruto = items.reduce(
    (sum: number, item: any) => sum + item.precio * item.cantidad,
    0
  );
  const descuento =
    beneficioCanjeado === '20% Descuento' ? totalBruto * 0.2 : 0;
  const totalFinal = totalBruto - descuento;

  // 1. Crear fila en PEDIDOS
  await appendRow('PEDIDOS', [
    idPedido,
    usuario.id_usuario ?? '',
    usuario.name ?? '',        // Nombre_Cliente_Snap
    fechaStr,                  // Fecha_Hora
    'Recibido',                // Estado inicial
    horaRecoleccion ?? '',     // Hora_Recoleccion
    totalBruto,
    beneficioCanjeado ?? 'Ninguno',
    descuento,
    totalFinal,
    notas ?? '',
    'App',                     // Origen_Venta
    '',                        // ID_Empleado (vacío para pedidos online)
  ]);

  // 2. Crear filas en DT PEDIDOS (una por artículo)
  const dtExistentes = await getSheetData('DT PEDIDOS');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idDetalle = `DET-${String(dtExistentes.length + i + 1).padStart(4, '0')}`;

    await appendRow('DT PEDIDOS', [
      idDetalle,
      idPedido,
      item.id,                        // ID_Producto
      item.nombre,                    // Nombre_Producto_Snap
      item.cantidad,
      item.precio,                    // Precio_Unitario_Snap
      item.precio * item.cantidad,    // Subtotal
      item.notas ?? '',
    ]);
  }

  // 3. Actualizar programa de lealtad en USUARIOS
  const totalArticulosNuevos = items.reduce(
    (sum: number, item: any) => sum + item.cantidad,
    0
  );

  const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', usuario.id_usuario);
  if (usuarioRow) {
    const cicloActual = parseInt(usuarioRow.data.Ciclo_Actual) || 0;
    const historicoActual = parseInt(usuarioRow.data.Total_Articulos_Historico) || 0;
    const nuevoCiclo = cicloActual + totalArticulosNuevos;

    let beneficioNuevo = 'Ninguno';
    let cicloFinal = nuevoCiclo;

    if (nuevoCiclo >= 10) {
      beneficioNuevo = 'Articulo Gratis';
      cicloFinal = nuevoCiclo - 10; // Reinicio del ciclo
    } else if (nuevoCiclo >= 5) {
      beneficioNuevo = '20% Descuento';
    }

    // Columnas en USUARIOS (ajusta si el orden de tu Sheet es diferente):
    // Col 6 = Ciclo_Actual, Col 7 = Total_Articulos_Historico, Col 8 = Beneficio_Disponible
    await updateCell('USUARIOS', usuarioRow.rowIndex, 6, cicloFinal);
    await updateCell('USUARIOS', usuarioRow.rowIndex, 7, historicoActual + totalArticulosNuevos);
    await updateCell('USUARIOS', usuarioRow.rowIndex, 8, beneficioNuevo);
  }

  return NextResponse.json({ success: true, idPedido });
}
