/**
 * app/api/admin/reportes/ventas/route.ts
 *
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&detalle=1]
 *   → Descarga un CSV con las ventas del rango.
 *     detalle=1 → una fila por producto vendido (para analizar qué se vende)
 *     sin detalle → una fila por pedido (corte de ventas)
 *
 * El CSV se genera pensado para abrirse en Excel en español:
 * - BOM UTF-8 para que los acentos y la ñ se vean bien.
 * - Separador ';' + directiva "sep=;" (Excel es-MX/es-ES lo espera así).
 * - Decimales con coma.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

const SEP = ';';

// Escapa un valor de texto para CSV
const celda = (v: unknown): string => {
  const s = (v ?? '').toString();
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Número con coma decimal (formato español) para que Excel lo lea como número
const num = (v: unknown): string => {
  const n = parseFloat((v ?? '0').toString());
  return (isNaN(n) ? 0 : n).toFixed(2).replace('.', ',');
};

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const hoy = fechaHoyMTY();
  const desde = searchParams.get('desde') || hoy;
  const hasta = searchParams.get('hasta') || desde;
  const conDetalle = searchParams.get('detalle') === '1';

  const [pedidos, usuarios] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('USUARIOS'),
  ]);

  const telefonoPorUsuario = new Map(usuarios.map((u) => [u.ID_Usuario, u.Telefono || '']));

  const enRango = pedidos
    .map((p) => ({ p, info: parsearFechaHora(p.Fecha_Hora) }))
    .filter(({ info }) => !!info && info.fechaISO >= desde && info.fechaISO <= hasta)
    .sort((a, b) => a.info!.timestamp - b.info!.timestamp);

  const lineas: string[] = ['sep=;'];

  if (!conDetalle) {
    lineas.push(
      [
        'Fecha', 'Hora', 'ID_Pedido', 'Cliente', 'Telefono', 'Estado',
        'Origen', 'Metodo_Pago', 'Estado_Pago', 'Total_Bruto', 'Descuento', 'Total_Final',
      ].join(SEP)
    );
    for (const { p, info } of enRango) {
      lineas.push(
        [
          celda(info!.fechaISO),
          celda(info!.horaLegible),
          celda(p.ID_Pedido),
          celda(p.Nombre_Cliente_Snap),
          celda(telefonoPorUsuario.get(p.ID_Usuario) || p.Telefono_Cliente || ''),
          celda(p.Estado),
          celda(p.Origen_Venta || 'App'),
          celda(p.Metodo_Pago || 'Sin registrar'),
          celda(p.Estado_Pago || ''),
          num(p.Total_Bruto),
          num(p.Descuento_Monto),
          num(p.Total_Final),
        ].join(SEP)
      );
    }
  } else {
    const detalles = await getSheetData('DT PEDIDOS');
    const porPedido = new Map<string, Record<string, string>[]>();
    for (const d of detalles) {
      if (!porPedido.has(d.ID_Pedido)) porPedido.set(d.ID_Pedido, []);
      porPedido.get(d.ID_Pedido)!.push(d);
    }
    lineas.push(
      [
        'Fecha', 'Hora', 'ID_Pedido', 'Cliente', 'Estado', 'Origen', 'Metodo_Pago',
        'Producto', 'Cantidad', 'Precio_Unitario', 'Subtotal',
      ].join(SEP)
    );
    for (const { p, info } of enRango) {
      for (const item of porPedido.get(p.ID_Pedido) || []) {
        lineas.push(
          [
            celda(info!.fechaISO),
            celda(info!.horaLegible),
            celda(p.ID_Pedido),
            celda(p.Nombre_Cliente_Snap),
            celda(p.Estado),
            celda(p.Origen_Venta || 'App'),
            celda(p.Metodo_Pago || 'Sin registrar'),
            celda(item.Nombre_Producto_Snap),
            celda(item.Cantidad),
            num(item.Precio_Unitario_Snap),
            num(item.Subtotal),
          ].join(SEP)
        );
      }
    }
  }

  // BOM para que Excel respete los acentos
  const csv = '﻿' + lineas.join('\r\n');
  const nombre = `ventas_${desde}_a_${hasta}${conDetalle ? '_detalle' : ''}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  });
}
