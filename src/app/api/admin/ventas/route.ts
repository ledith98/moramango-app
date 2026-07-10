/**
 * app/api/admin/ventas/route.ts
 *
 * POST → Registra una venta hecha en el local (mostrador), sin cuenta
 *        ni app del cliente. Escribe en PEDIDOS con Origen_Venta='Local',
 *        guarda quién la registró (ID_Empleado), el método de pago
 *        (Efectivo/Terminal) y un teléfono opcional del cliente.
 *        Los items van a DT PEDIDOS igual que un pedido de la app, para
 *        que métricas y "producto más vendido" cuadren.
 *
 * Las columnas Metodo_Pago y Telefono_Cliente se crean automáticamente
 * al final de PEDIDOS la primera vez (ensureColumn) — no hay que tocar
 * el Sheet a mano.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, ensureColumn, getSheetData, updateCell } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

const ESTADOS_VALIDOS = [
  'Recibido',
  'En preparación',
  'Listo para recoger',
  'Entregado',
  'Cancelado',
];

const METODOS_PAGO = ['Efectivo', 'Terminal', 'Transferencia'];

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, telefono, metodoPago, estado, notas, items } = await req.json();

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'El nombre del cliente es obligatorio' }, { status: 400 });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'La venta no tiene productos' }, { status: 400 });
  }
  if (!METODOS_PAGO.includes(metodoPago)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }
  const estadoInicial = estado || 'Recibido';
  if (!ESTADOS_VALIDOS.includes(estadoInicial)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  }

  const ahora = new Date();
  const fechaStr = ahora.toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  // Mismo generador de ID que el pedido de la app: PED-YYMMDD-NNN
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const getParte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00';
  const fechaCorta = `${getParte('year')}${getParte('month')}${getParte('day')}`;

  const pedidosExistentes = await getSheetData('PEDIDOS');
  const delMismoDia = pedidosExistentes.filter((p) =>
    p.ID_Pedido?.startsWith(`PED-${fechaCorta}-`)
  ).length;
  const idPedido = `PED-${fechaCorta}-${String(delMismoDia + 1).padStart(3, '0')}`;

  const total = items.reduce(
    (sum: number, item: any) => sum + (parseFloat(item.precio) || 0) * (parseInt(item.cantidad) || 0),
    0
  );

  // Fila en PEDIDOS — venta local: sin usuario, sin beneficios de lealtad
  const filaPedido = await appendRow('PEDIDOS', [
    idPedido,
    '',                                       // ID_Usuario — no aplica
    nombre.trim(),                            // Nombre_Cliente_Snap
    fechaStr,
    estadoInicial,
    '',                                       // Hora_Recoleccion
    total,                                    // Total_Bruto
    'Ninguno',                                // Beneficio_Canjeado
    0,                                        // Descuento_Monto
    total,                                    // Total_Final
    notas?.trim() || '',
    'Local',                                  // Origen_Venta
    (session.user as any).id_usuario ?? '',   // ID_Empleado — quién registró
  ]);

  // Columnas extra (se crean solas la primera vez)
  const colMetodo = await ensureColumn('PEDIDOS', 'Metodo_Pago');
  await updateCell('PEDIDOS', filaPedido, colMetodo, metodoPago);

  if (typeof telefono === 'string' && telefono.trim()) {
    const colTelefono = await ensureColumn('PEDIDOS', 'Telefono_Cliente');
    await updateCell('PEDIDOS', filaPedido, colTelefono, telefono.trim());
  }

  // Detalle de items
  const dtExistentes = await getSheetData('DT PEDIDOS');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idDetalle = `DET-${String(dtExistentes.length + i + 1).padStart(4, '0')}`;
    const cantidad = parseInt(item.cantidad) || 1;
    const precio = parseFloat(item.precio) || 0;

    await appendRow('DT PEDIDOS', [
      idDetalle,
      idPedido,
      item.id ?? '',
      item.nombre ?? '',
      cantidad,
      precio,
      precio * cantidad,
      '',
    ]);
  }

  return NextResponse.json({ success: true, idPedido, total });
}
