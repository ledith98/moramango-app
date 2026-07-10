/**
 * app/api/admin/pedidos/[id]/route.ts
 *
 * GET → Detalle de un pedido: datos del pedido + items (DT PEDIDOS) +
 *       cliente (nombre/teléfono/email desde USUARIOS)
 */

import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await context.params;

  const [pedidos, detalles, usuarios] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
    getSheetData('USUARIOS'),
  ]);

  const pedido = pedidos.find((p) => p.ID_Pedido === id);
  if (!pedido) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }

  const items = detalles.filter((d) => d.ID_Pedido === id);
  const usuario = usuarios.find((u) => u.ID_Usuario === pedido.ID_Usuario);

  // Ventas locales no tienen usuario registrado: el cliente se arma con
  // los datos capturados en mostrador para que el modal y el botón de
  // WhatsApp funcionen igual.
  const cliente = usuario
    ? { nombre: usuario.Nombre, telefono: usuario.Telefono, email: usuario.Email }
    : { nombre: pedido.Nombre_Cliente_Snap || '', telefono: pedido.Telefono_Cliente || '', email: '' };

  return NextResponse.json({ pedido, items, cliente });
}
