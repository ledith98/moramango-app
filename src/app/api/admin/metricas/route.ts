/**
 * app/api/admin/metricas/route.ts
 *
 * GET ?fecha=YYYY-MM-DD (default hoy) →
 *   totalVentas, numPedidos, ticketPromedio (excluyen pedidos Cancelado)
 *   productoMasVendido (agregando Cantidad de DT PEDIDOS de esos pedidos)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fechaISO = searchParams.get('fecha') || fechaHoyMTY();

  const [pedidos, detalles] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  const delDia = pedidos.filter((p) => parsearFechaHora(p.Fecha_Hora)?.fechaISO === fechaISO);
  const validos = delDia.filter((p) => p.Estado !== 'Cancelado');

  const totalVentas = validos.reduce((sum, p) => sum + (parseFloat(p.Total_Final) || 0), 0);
  const numPedidos = validos.length;
  const ticketPromedio = numPedidos > 0 ? totalVentas / numPedidos : 0;

  const idsValidos = new Set(validos.map((p) => p.ID_Pedido));
  const conteoProductos = new Map<string, number>();
  for (const item of detalles) {
    if (!idsValidos.has(item.ID_Pedido)) continue;
    const nombre = item.Nombre_Producto_Snap || item.ID_Producto;
    const cantidad = parseInt(item.Cantidad) || 0;
    conteoProductos.set(nombre, (conteoProductos.get(nombre) || 0) + cantidad);
  }

  let productoMasVendido: { nombre: string; cantidad: number } | null = null;
  for (const [nombre, cantidad] of conteoProductos) {
    if (!productoMasVendido || cantidad > productoMasVendido.cantidad) {
      productoMasVendido = { nombre, cantidad };
    }
  }

  return NextResponse.json({
    fecha: fechaISO,
    totalVentas,
    numPedidos,
    ticketPromedio,
    productoMasVendido,
    pedidosCancelados: delDia.length - validos.length,
  });
}
