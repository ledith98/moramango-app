/**
 * app/api/pedidos/route.ts
 *
 * GET  → Devuelve los pedidos del usuario logueado
 * POST → Crea pedido, actualiza lealtad por PEDIDOS (no artículos)
 *
 * Formato ID: PED-YYMMDD-HHMMSS-NNN
 *   - YYMMDD: fecha en zona horaria de Monterrey
 *   - HHMMSS: hora exacta del pedido (24h)
 *   - NNN: secuencial del día
 * La hora dentro del ID evita colisiones si el secuencial se calcula mal
 * por lag de Google Sheets.
 *
 * Lógica de lealtad:
 * - 5 pedidos → 15% descuento (ciclo NO reinicia al canjear)
 * - 10 pedidos → Artículo gratis ≤ $35 (ciclo SÍ reinicia al canjear)
 * - Un solo beneficio activo a la vez
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { appendRow, getSheetData, findRow, updateCell } from '@/lib/googleSheets';

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

  // Descomponer fecha/hora en zona horaria de Monterrey
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(ahora);

  const getParte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '00';

  const yy = getParte('year');
  const mm = getParte('month');
  const dd = getParte('day');
  const hh = getParte('hour');
  const mi = getParte('minute');
  const ss = getParte('second');

  const fechaCorta = `${yy}${mm}${dd}`;   // 260708
  const horaCorta = `${hh}${mi}${ss}`;    // 125430

  // Contar pedidos del día para el número secuencial
  const pedidosExistentes = await getSheetData('PEDIDOS');
  const delMismoDia = pedidosExistentes.filter((p) =>
    p.ID_Pedido?.includes(`-${fechaCorta}-`)
  ).length;

  // Formato final: PED-260708-125430-023
  const idPedido = `PED-${fechaCorta}-${horaCorta}-${String(delMismoDia + 1).padStart(3, '0')}`;

  const totalBruto = items.reduce(
    (sum: number, item: any) => sum + item.precio * item.cantidad,
    0
  );

  // Calcular descuento según beneficio canjeado
  let descuento = 0;
  if (beneficioCanjeado === '15% Descuento') {
    descuento = totalBruto * 0.15;
  } else if (beneficioCanjeado === 'Articulo Gratis') {
    // El artículo gratis se descuenta cuando implementemos el UI de selección
    descuento = 0;
  }
  const totalFinal = totalBruto - descuento;

  // 1. Fila en PEDIDOS
  await appendRow('PEDIDOS', [
    idPedido,
    usuario.id_usuario ?? '',
    usuario.name ?? '',
    fechaStr,
    'Recibido',
    horaRecoleccion ?? '',
    totalBruto,
    beneficioCanjeado ?? 'Ninguno',
    descuento,
    totalFinal,
    notas ?? '',
    'App',
    '',
  ]);

  // 2. Filas en DT PEDIDOS
  const dtExistentes = await getSheetData('DT PEDIDOS');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idDetalle = `DET-${String(dtExistentes.length + i + 1).padStart(4, '0')}`;

    await appendRow('DT PEDIDOS', [
      idDetalle,
      idPedido,
      item.id,
      item.nombre,
      item.cantidad,
      item.precio,
      item.precio * item.cantidad,
      item.notas ?? '',
    ]);
  }

  // 3. Actualizar lealtad — se acumula por PEDIDO, no por artículos
  const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', usuario.id_usuario);
  if (usuarioRow) {
    const cicloActual = parseInt(usuarioRow.data.Ciclo_Actual) || 0;
    const historicoActual = parseInt(usuarioRow.data.Total_Articulos_Historico) || 0;
    const nuevoCiclo = cicloActual + 1;

    let beneficioNuevo = usuarioRow.data.Beneficio_Disponible || 'Ninguno';
    let cicloFinal = nuevoCiclo;

    if (beneficioCanjeado === 'Articulo Gratis') {
      // Solo el artículo gratis reinicia el ciclo
      cicloFinal = 0;
      beneficioNuevo = 'Ninguno';
    } else if (beneficioCanjeado === '15% Descuento') {
      // El descuento NO reinicia el ciclo, sigue acumulando
      beneficioNuevo = 'Ninguno';
    } else {
      // No se canjeó nada — calcular si se ganó un beneficio nuevo
      if (nuevoCiclo >= 10) {
        beneficioNuevo = 'Articulo Gratis';
      } else if (nuevoCiclo >= 5) {
        beneficioNuevo = '15% Descuento';
      }
    }

    await updateCell('USUARIOS', usuarioRow.rowIndex, 6, cicloFinal);
    await updateCell('USUARIOS', usuarioRow.rowIndex, 7, historicoActual + 1);
    await updateCell('USUARIOS', usuarioRow.rowIndex, 8, beneficioNuevo);
  }

  return NextResponse.json({ success: true, idPedido });
}
