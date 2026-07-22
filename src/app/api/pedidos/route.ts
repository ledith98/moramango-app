/**
 * app/api/pedidos/route.ts
 *
 * GET  → Devuelve los pedidos del usuario logueado
 * POST → Crea pedido, actualiza lealtad por PEDIDOS (no artículos)
 *
 * Formato ID: PED-YYMMDD-NNN
 *   - YYMMDD: fecha en zona horaria de Monterrey
 *   - NNN: secuencial del día
 * La hora se ve en la columna Fecha_Hora, no se duplica en el ID.
 *
 * Lógica de lealtad:
 * - 5 pedidos → 15% descuento (ciclo NO reinicia al canjear)
 * - 10 pedidos → Artículo gratis ≤ $35 (ciclo SÍ reinicia al canjear)
 * - Un solo beneficio activo a la vez
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { appendRow, ensureColumn, findRow, getSheetData, updateCell } from '@/lib/googleSheets';
import { actualizarLealtad, beneficioVigente, descuentoPorBeneficio } from '@/lib/lealtad';
import { parsearFechaHora } from '@/lib/pedidoFecha';
import { baseUrlDesdeRequest, crearPreferencia, mpConfigurado } from '@/lib/mercadoPago';
import { enviarTelegram } from '@/lib/telegram';
import { moverStockDePedido } from '@/lib/stock';

/**
 * Devuelve los pedidos del usuario logueado, del más reciente al más
 * antiguo y con sus productos, para la pantalla "Mis pedidos" (ver el
 * estado y poder volver a pedir).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const idUsuario = (session.user as any).id_usuario;
  if (!idUsuario) return NextResponse.json({ pedidos: [] });

  const [todos, detalles] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  // Pedidos que este cliente ya calificó (para no volver a pedirle opinión).
  // La hoja puede no existir todavía si nadie ha opinado.
  let yaOpinados = new Set<string>();
  try {
    const opiniones = await getSheetData('OPINIONES');
    yaOpinados = new Set(opiniones.filter((o) => o.ID_Usuario === idUsuario).map((o) => o.ID_Pedido));
  } catch {
    // sin opiniones aún
  }

  const itemsPorPedido = new Map<string, Record<string, string>[]>();
  for (const d of detalles) {
    if (!itemsPorPedido.has(d.ID_Pedido)) itemsPorPedido.set(d.ID_Pedido, []);
    itemsPorPedido.get(d.ID_Pedido)!.push(d);
  }

  const misPedidos = todos
    .filter((p) => p.ID_Usuario === idUsuario)
    .map((p) => ({ p, info: parsearFechaHora(p.Fecha_Hora) }))
    .sort((a, b) => (b.info?.timestamp ?? 0) - (a.info?.timestamp ?? 0))
    .map(({ p, info }) => ({
      idPedido: p.ID_Pedido,
      fecha: info?.fechaISO ?? '',
      hora: info?.horaLegible ?? '',
      estado: p.Estado || 'Recibido',
      estadoPago: p.Estado_Pago || '',
      avisoLlegada: p.Aviso_Llegada || '',
      metodoPago: p.Metodo_Pago || '',
      total: parseFloat(p.Total_Final) || 0,
      notas: p.Notas_Pedido || '',
      yaOpino: yaOpinados.has(p.ID_Pedido),
      items: (itemsPorPedido.get(p.ID_Pedido) || []).map((d) => ({
        idProducto: d.ID_Producto,
        nombre: d.Nombre_Producto_Snap,
        cantidad: parseInt(d.Cantidad) || 1,
        subtotal: parseFloat(d.Subtotal) || 0,
      })),
    }));

  return NextResponse.json({ pedidos: misPedidos });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const { items, notas, horaRecoleccion, beneficioCanjeado, pagoEnLinea, metodoPago } = await req.json();
  // Desde la tienda el cliente solo puede elegir Transferencia (Efectivo/
  // Terminal son del punto de venta en mostrador).
  const esTransferencia = metodoPago === 'Transferencia';

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 });
  }

  const usuario = session.user as any;
  const ahora = new Date();
  const fechaStr = ahora.toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  // Descomponer fecha en zona horaria de Monterrey (solo YY/MM/DD para el ID)
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);

  const getParte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '00';

  const yy = getParte('year');
  const mm = getParte('month');
  const dd = getParte('day');

  const fechaCorta = `${yy}${mm}${dd}`;   // 260708

  // Contar pedidos del día para el número secuencial
  const pedidosExistentes = await getSheetData('PEDIDOS');
  const delMismoDia = pedidosExistentes.filter((p) =>
    p.ID_Pedido?.startsWith(`PED-${fechaCorta}-`)
  ).length;

  // Formato final: PED-260708-001
  const idPedido = `PED-${fechaCorta}-${String(delMismoDia + 1).padStart(3, '0')}`;

  const totalBruto = items.reduce(
    (sum: number, item: any) => sum + item.precio * item.cantidad,
    0
  );

  // El descuento se calcula sobre lo que el Sheet dice que el cliente
  // tiene disponible AHORA (respetando vencimiento), no sobre lo que
  // mande el navegador — así un cupón vencido o ya usado no se puede
  // reintentar aunque la app del cliente no se haya actualizado.
  const usuarioRowPrevio = await findRow('USUARIOS', 'ID_Usuario', usuario.id_usuario);
  const beneficioReal = usuarioRowPrevio ? beneficioVigente(usuarioRowPrevio.data) : 'Ninguno';
  const beneficioValido = beneficioCanjeado && beneficioCanjeado === beneficioReal ? beneficioCanjeado : 'Ninguno';

  // El artículo gratis se descuenta cuando implementemos el UI de selección
  const descuento =
    beneficioValido === 'Articulo Gratis' ? 0 : descuentoPorBeneficio(beneficioValido, totalBruto);
  const totalFinal = totalBruto - descuento;

  // 1. Fila en PEDIDOS
  const filaPedido = await appendRow('PEDIDOS', [
    idPedido,
    usuario.id_usuario ?? '',
    usuario.name ?? '',
    fechaStr,
    'Recibido',
    horaRecoleccion ?? '',
    totalBruto,
    beneficioValido,
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

  // 3. Actualizar lealtad — se acumula por PEDIDO, no por artículos.
  // Las reglas viven en src/lib/lealtad.ts, compartidas con el mostrador.
  await actualizarLealtad(usuario.id_usuario, beneficioValido);

  // 3.5 Apartar el stock ya: si se esperara a "Listo para recoger", dos
  // clientes podrían pagar la última pieza con minutos de diferencia.
  await moverStockDePedido(idPedido, 'apartar');

  // 4. Aviso a Telegram (si está configurado). Se hace await para que el
  // envío alcance a completarse antes de que termine la función en Vercel,
  // pero nunca rompe el pedido si falla.
  try {
    const numArticulos = items.reduce(
      (sum: number, item: any) => sum + (parseInt(item.cantidad) || 1),
      0
    );
    // Ojo: este aviso sale al CREAR el pedido, antes de que el cliente
    // pague. Por eso el pago en línea se anuncia como pendiente; cuando
    // Mercado Pago confirme, el webhook manda un segundo aviso.
    const formaPagoTexto = esTransferencia
      ? '📲 Transferencia — ⏳ POR CONFIRMAR'
      : pagoEnLinea
      ? '💳 Pago en línea — ⏳ PENDIENTE (aún no paga)'
      : '🏪 Pagar al recoger';
    // Los combos se avisan con su descripción (qué trae el combo), para
    // que quien prepara no tenga que consultar el menú. Los productos
    // normales se dejan en una línea para no inflar el mensaje.
    const productosSheet = await getSheetData('Productos').catch(() => []);
    const productoPorId = new Map(productosSheet.map((p) => [p.ID_Producto, p]));
    const listaItems = items
      .map((it: any) => {
        const linea = `• ${parseInt(it.cantidad) || 1}× ${it.nombre}`;
        const prod = productoPorId.get(it.id);
        const esCombo = ((prod?.Categoria ?? prod?.['Categoría']) || '')
          .toLowerCase()
          .includes('combo');
        const desc = (prod?.Descripcion || '').trim();
        return esCombo && desc ? `${linea}\n   <i>${desc}</i>` : linea;
      })
      .join('\n');

    await enviarTelegram(
      `🔔 <b>Nuevo pedido ${idPedido}</b>\n` +
        `👤 ${usuario.name ?? 'Cliente'}\n` +
        `🛒 ${numArticulos} artículo${numArticulos === 1 ? '' : 's'} — <b>$${totalFinal.toFixed(2)}</b>\n` +
        `${formaPagoTexto}\n\n` +
        `${listaItems}` +
        (notas?.trim() ? `\n\n📝 ${notas.trim()}` : '')
    );
  } catch (error) {
    console.error('Error enviando aviso a Telegram:', error);
  }

  // 5. Pago por transferencia — el cliente ve la CLABE en la tienda y
  // transfiere; queda 'Pendiente' hasta que el admin confirme que llegó.
  if (esTransferencia) {
    try {
      const colMetodo = await ensureColumn('PEDIDOS', 'Metodo_Pago');
      await updateCell('PEDIDOS', filaPedido, colMetodo, 'Transferencia');
      const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
      await updateCell('PEDIDOS', filaPedido, colEstadoPago, 'Pendiente');
    } catch (error) {
      console.error('Error marcando transferencia:', error);
    }
  }

  // 6. Pago en línea (opcional) — si falla, el pedido ya quedó creado y
  // el cliente simplemente paga al recoger.
  if (pagoEnLinea && mpConfigurado()) {
    try {
      const numArticulos = items.reduce(
        (sum: number, item: any) => sum + (parseInt(item.cantidad) || 1),
        0
      );
      const preferencia = await crearPreferencia({
        idPedido,
        descripcion: `Pedido Moramango ${idPedido} (${numArticulos} artículo${numArticulos === 1 ? '' : 's'})`,
        total: totalFinal,
        baseUrl: baseUrlDesdeRequest(req),
      });

      if (preferencia) {
        const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
        await updateCell('PEDIDOS', filaPedido, colEstadoPago, 'Pendiente');
        return NextResponse.json({ success: true, idPedido, checkoutUrl: preferencia.checkoutUrl });
      }
    } catch (error) {
      console.error('Error iniciando pago en línea:', error);
    }
  }

  return NextResponse.json({ success: true, idPedido });
}

