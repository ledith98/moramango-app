/**
 * app/api/admin/pedidos/route.ts
 *
 * Solo accesible para admin — el middleware.ts bloquea esta ruta
 * automáticamente si el usuario no tiene rol=admin.
 *
 * GET  → Pedidos, filtrables por ?fecha=YYYY-MM-DD (default hoy) y ?estado=
 *        Se enriquecen con el teléfono del cliente (cruce con USUARIOS)
 * PATCH → Cambiar el estado de un pedido (incluye "Cancelado")
 *         El stock se aparta al CREAR el pedido; aquí solo se devuelve
 *         cuando el pedido se cancela.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, findRow, updateCell, ensureColumn } from '@/lib/googleSheets';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { METODO_PAGO_EN_LINEA, normalizarMetodoPago } from '@/lib/negocio';
import { getAdminSession } from '@/lib/roles';
import { moverStockDePedido } from '@/lib/stock';
import { revertirLealtad } from '@/lib/lealtad';
import { enviarTelegram } from '@/lib/telegram';

export const ESTADOS_VALIDOS = [
  'Recibido',
  'En preparación',
  'Listo para recoger',
  'Entregado',
  'Cancelado',
];

// ── GET: pedidos filtrados por fecha (default hoy) y estado opcional ─────────
export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Rango [desde, hasta]. Compatibilidad: ?fecha= sigue sirviendo para un
  // solo día. Sin nada, hoy. hasta >= desde siempre (se ordenan si vienen
  // al revés) y se incluyen ambos extremos.
  const fechaUnica = searchParams.get('fecha');
  let desde = searchParams.get('desde') || fechaUnica || fechaHoyMTY();
  let hasta = searchParams.get('hasta') || fechaUnica || desde;
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  const estado = searchParams.get('estado');
  // Filtro por forma de cobro. 'Sin registrar' son los que aún no tienen
  // ninguna: casi siempre pedidos de la app que se pagan al recoger.
  const metodo = searchParams.get('metodo');

  const [pedidos, usuarios] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('USUARIOS'),
  ]);

  const telefonoPorUsuario = new Map(usuarios.map((u) => [u.ID_Usuario, u.Telefono || '']));

  const delDia = pedidos
    .map((p) => ({ pedido: p, info: parsearFechaHora(p.Fecha_Hora) }))
    .filter(({ info }) => info && info.fechaISO >= desde && info.fechaISO <= hasta)
    .filter(({ pedido }) => !estado || pedido.Estado === estado)
    .filter(({ pedido }) => {
      if (!metodo) return true;
      const m = normalizarMetodoPago(pedido.Metodo_Pago);
      return metodo === 'Sin registrar' ? !m : m === metodo;
    })
    .sort((a, b) => (b.info!.timestamp - a.info!.timestamp))
    .map(({ pedido, info }) => ({
      ...pedido,
      // Ventas locales no tienen usuario: cae al teléfono capturado en mostrador
      Telefono: telefonoPorUsuario.get(pedido.ID_Usuario) || pedido.Telefono_Cliente || '',
      HoraLegible: info!.horaLegible,
    }));

  return NextResponse.json({ pedidos: delDia });
}

// ── PATCH: cambiar estado y/o método de pago de un pedido ────────────────────
// 'Mercado Pago' se acepta por compatibilidad con pedidos viejos
const METODOS_PAGO = ['Efectivo', 'Terminal', 'Transferencia', METODO_PAGO_EN_LINEA, 'Mercado Pago'];

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idPedido, nuevoEstado, metodoPago, estadoPago } = await req.json();

  if (!idPedido || (!nuevoEstado && !metodoPago && !estadoPago)) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  if (nuevoEstado && !ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  if (metodoPago && !METODOS_PAGO.includes(metodoPago)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }

  if (estadoPago && !['Pagado', 'Pendiente', 'Reembolsado'].includes(estadoPago)) {
    return NextResponse.json({ error: 'Estado de pago inválido' }, { status: 400 });
  }

  const pedidoRow = await findRow('PEDIDOS', 'ID_Pedido', idPedido);
  if (!pedidoRow) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  if (nuevoEstado) {
    // Columna 5 = Estado en tu hoja PEDIDOS
    await updateCell('PEDIDOS', pedidoRow.rowIndex, 5, nuevoEstado);

    // El stock se aparta al crear el pedido, no aquí. Al cancelar se
    // devuelve, salvo que ya estuviera cancelado (evita duplicar).
    if (nuevoEstado === 'Cancelado' && pedidoRow.data.Estado !== 'Cancelado') {
      await moverStockDePedido(idPedido, 'devolver');
      // El avance para su premio se deshace junto con el pedido. La
      // condición de arriba evita descontarlo dos veces si se vuelve a
      // marcar Cancelado un pedido que ya lo estaba.
      await revertirLealtad(pedidoRow.data.ID_Usuario, pedidoRow.data.Beneficio_Canjeado);
    }
  }

  if (metodoPago) {
    // Los pedidos de la app no traen método de pago (pagan al recoger):
    // el admin lo asigna aquí para que el corte de caja quede completo.
    const colMetodo = await ensureColumn('PEDIDOS', 'Metodo_Pago');
    await updateCell('PEDIDOS', pedidoRow.rowIndex, colMetodo, metodoPago);
  }

  if (estadoPago) {
    // Confirmar (o revertir) el pago de una transferencia pendiente
    const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
    await updateCell('PEDIDOS', pedidoRow.rowIndex, colEstadoPago, estadoPago);

    // Aviso de que el dinero ya cayó. Importa cuando quien confirma no es
    // la dueña: así se entera de que ese cobro dejó de estar pendiente.
    if (estadoPago === 'Pagado' && pedidoRow.data.Estado_Pago !== 'Pagado') {
      try {
        const monto = parseFloat(pedidoRow.data.Total_Final) || 0;
        await enviarTelegram(
          `💰 <b>Cobro confirmado</b> — ${idPedido}
` +
            `👤 ${pedidoRow.data.Nombre_Cliente_Snap || 'Cliente'}
` +
            `${normalizarMetodoPago(pedidoRow.data.Metodo_Pago) || 'Sin método'} — <b>$${monto.toFixed(2)}</b>`
        );
      } catch (error) {
        console.error('Error avisando del cobro confirmado:', error);
      }
    }
  }

  return NextResponse.json({ success: true });
}


