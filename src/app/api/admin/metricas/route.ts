/**
 * app/api/admin/metricas/route.ts
 *
 * GET ?fecha=YYYY-MM-DD (default hoy) →
 *   totalVentas, numPedidos, ticketPromedio (excluyen pedidos Cancelado)
 *   productoMasVendido (agregando Cantidad de DT PEDIDOS de esos pedidos)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { normalizarMetodoPago } from '@/lib/negocio';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Rango de fechas; si solo llega una, se usa como desde y hasta (un día).
  const hoy = fechaHoyMTY();
  const desde = searchParams.get('desde') || searchParams.get('fecha') || hoy;
  const hasta = searchParams.get('hasta') || desde;

  const [pedidos, detalles] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  // Las fechas ISO (YYYY-MM-DD) se comparan como texto sin problema
  const delDia = pedidos.filter((p) => {
    const f = parsearFechaHora(p.Fecha_Hora)?.fechaISO;
    return !!f && f >= desde && f <= hasta;
  });
  // Un pedido reembolsado no es una venta: el dinero se devolvió. Se
  // excluye aunque no lo hayan marcado como Cancelado, para que los
  // ingresos nunca cuenten dinero que ya salió de vuelta.
  const estaReembolsado = (p: Record<string, string>) => p.Estado_Pago === 'Reembolsado';
  const validos = delDia.filter((p) => p.Estado !== 'Cancelado' && !estaReembolsado(p));

  const reembolsadosDelDia = delDia.filter(estaReembolsado);
  const reembolsos = {
    total: reembolsadosDelDia.reduce((sum, p) => sum + (parseFloat(p.Total_Final) || 0), 0),
    pedidos: reembolsadosDelDia.length,
  };

  const totalVentas = validos.reduce((sum, p) => sum + (parseFloat(p.Total_Final) || 0), 0);
  const numPedidos = validos.length;
  const ticketPromedio = numPedidos > 0 ? totalVentas / numPedidos : 0;

  // Desglose de ingresos por método de pago (corte de caja).
  // Los pedidos sin método asignado (típicamente de app aún no cobrados)
  // caen en 'Sin registrar'.
  const ventasPorMetodo: Record<string, { total: number; pedidos: number }> = {};
  for (const p of validos) {
    const metodo = normalizarMetodoPago(p.Metodo_Pago) || 'Sin registrar';
    if (!ventasPorMetodo[metodo]) ventasPorMetodo[metodo] = { total: 0, pedidos: 0 };
    ventasPorMetodo[metodo].total += parseFloat(p.Total_Final) || 0;
    ventasPorMetodo[metodo].pedidos += 1;
  }

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
    desde,
    hasta,
    totalVentas,
    numPedidos,
    ticketPromedio,
    productoMasVendido,
    ventasPorMetodo,
    reembolsos,
    // Cancelados "puros": los reembolsados se reportan aparte
    pedidosCancelados: delDia.filter((p) => p.Estado === 'Cancelado' && !estaReembolsado(p)).length,
  });
}
