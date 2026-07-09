/**
 * app/api/admin/pedidos/route.ts
 *
 * Solo accesible para admin — el middleware.ts bloquea esta ruta
 * automáticamente si el usuario no tiene rol=admin.
 *
 * GET  → Pedidos, filtrables por ?fecha=YYYY-MM-DD (default hoy) y ?estado=
 *        Se enriquecen con el teléfono del cliente (cruce con USUARIOS)
 * PATCH → Cambiar el estado de un pedido (incluye "Cancelado")
 *         Cuando pasa a "Listo para recoger", descuenta insumos
 *         automáticamente usando las recetas de Catalogo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, findRow, updateCell } from '@/lib/googleSheets';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';

export const ESTADOS_VALIDOS = [
  'Recibido',
  'En preparación',
  'Listo para recoger',
  'Entregado',
  'Cancelado',
];

// ── GET: pedidos filtrados por fecha (default hoy) y estado opcional ─────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fechaISO = searchParams.get('fecha') || fechaHoyMTY();
  const estado = searchParams.get('estado');

  const [pedidos, usuarios] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('USUARIOS'),
  ]);

  const telefonoPorUsuario = new Map(usuarios.map((u) => [u.ID_Usuario, u.Telefono || '']));

  const delDia = pedidos
    .map((p) => ({ pedido: p, info: parsearFechaHora(p.Fecha_Hora) }))
    .filter(({ info }) => info?.fechaISO === fechaISO)
    .filter(({ pedido }) => !estado || pedido.Estado === estado)
    .sort((a, b) => (b.info!.timestamp - a.info!.timestamp))
    .map(({ pedido, info }) => ({
      ...pedido,
      Telefono: telefonoPorUsuario.get(pedido.ID_Usuario) || '',
      HoraLegible: info!.horaLegible,
    }));

  return NextResponse.json({ pedidos: delDia });
}

// ── PATCH: cambiar estado de un pedido ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { idPedido, nuevoEstado } = await req.json();

  if (!idPedido || !nuevoEstado) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const pedidoRow = await findRow('PEDIDOS', 'ID_Pedido', idPedido);
  if (!pedidoRow) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  // Columna 5 = Estado en tu hoja PEDIDOS
  await updateCell('PEDIDOS', pedidoRow.rowIndex, 5, nuevoEstado);

  // Descontar insumos cuando el pedido está listo
  if (nuevoEstado === 'Listo para recoger') {
    await descontarInsumos(idPedido);
  }

  return NextResponse.json({ success: true });
}

// ── Descuento automático de materia prima ─────────────────────────────────────
async function descontarInsumos(idPedido: string) {
  try {
    const detalles = await getSheetData('DT PEDIDOS');
    const itemsPedido = detalles.filter((d) => d.ID_Pedido === idPedido);
    if (itemsPedido.length === 0) return;

    const catalogo = await getSheetData('Catalogo');
    const insumos = await getSheetData('Insumos');

    for (const item of itemsPedido) {
      const cantidad = parseInt(item.Cantidad) || 1;

      // Recetas de este producto en Catalogo
      const recetas = catalogo.filter((c) => c.ID_Producto === item.ID_Producto);

      for (const receta of recetas) {
        const cantPorUnidad = parseFloat(receta.Cantidad_Receta) || 0;
        const totalDescontar = cantPorUnidad * cantidad;

        const insumoRow = await findRow('Insumos', 'ID_Insumo', receta.ID_Insumo);
        if (!insumoRow) continue;

        const stockActual = parseFloat(insumoRow.data.Stock_Actual) || 0;
        const nuevoStock = Math.max(0, stockActual - totalDescontar);

        // Columna 5 = Stock_Actual en tu hoja Insumos
        // Si tu columna está en otra posición, ajusta este número
        await updateCell('Insumos', insumoRow.rowIndex, 5, nuevoStock);
      }
    }
  } catch (error) {
    // El error no cancela el cambio de estado
    console.error('Error descontando insumos:', error);
  }
}
