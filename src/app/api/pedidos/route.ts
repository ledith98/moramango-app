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
import { METODO_PAGO_EN_LINEA } from '@/lib/negocio';
import { enviarTelegram } from '@/lib/telegram';
import { abrirCajaSiHaceFalta } from '@/lib/caja';
import { moverStockDePedido } from '@/lib/stock';
import { leerAjustes } from '@/lib/ajustes';
import { estadoTienda } from '@/lib/horario';
import { horaBonita, horaValida } from '@/lib/recoleccion';
import { validarItems } from '@/lib/preciosServidor';

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

  // Horario de atención. La tienda ya esconde el botón fuera de horario,
  // pero eso vive en el celular del cliente: quien deje la página abierta
  // desde antes de cerrar, o llame a la API por su cuenta, se frena aquí.
  const { horario } = await leerAjustes();
  const estado = estadoTienda(horario);
  if (!estado.abierta) {
    return NextResponse.json(
      { error: `Ahorita no estamos recibiendo pedidos. ${estado.mensaje}`.trim(), cerrado: true },
      { status: 409 }
    );
  }

  // La hora de recolección se revisa contra el horario real: quien deje la
  // pantalla abierta un rato tendría opciones que ya pasaron.
  if (!horaValida(horario, horaRecoleccion ?? '')) {
    return NextResponse.json(
      { error: 'Esa hora ya no está disponible. Vuelve a elegir una.' },
      { status: 400 }
    );
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

  // El precio sale de la hoja, no de lo que mandó el navegador: con
  // tamaños hay más de un precio válido por producto y el servidor tiene
  // que ser quien decida cuál se cobra.
  const validacion = await validarItems(items);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const itemsValidados = validacion.items;
  const totalBruto = validacion.total;

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
  for (let i = 0; i < itemsValidados.length; i++) {
    const item = itemsValidados[i];
    const idDetalle = `DET-${String(dtExistentes.length + i + 1).padStart(4, '0')}`;

    const filaDetalle = await appendRow('DT PEDIDOS', [
      idDetalle,
      idPedido,
      item.id,
      // El nombre ya trae el tamaño: "Jugo de Mango (1 litro)"
      item.nombre,
      item.cantidad,
      item.precio,
      item.precio * item.cantidad,
      '',
    ]);

    // El tamaño va en su propia columna, no solo dentro del nombre: es lo
    // que permite descontar el doble de fruta por un litro. Las filas
    // viejas la dejan vacía y siguen contando como una porción.
    if (item.tamano) {
      const colTamano = await ensureColumn('DT PEDIDOS', 'Tamano');
      await updateCell('DT PEDIDOS', filaDetalle, colTamano, item.tamano);
    }
  }

  // 3. Actualizar lealtad — se acumula por PEDIDO, no por artículos.
  // Las reglas viven en src/lib/lealtad.ts, compartidas con el mostrador.
  await actualizarLealtad(usuario.id_usuario, beneficioValido);

  // 3.5 Apartar el stock ya: si se esperara a "Listo para recoger", dos
  // clientes podrían pagar la última pieza con minutos de diferencia.
  await moverStockDePedido(idPedido, 'apartar');

  // Un pedido de la app también inaugura el día: si el primero llega por
  // ahí, la caja igual tiene que quedar abierta para poder cortarla.
  await abrirCajaSiHaceFalta();

  // 4. Aviso a Telegram (si está configurado). Se hace await para que el
  // envío alcance a completarse antes de que termine la función en Vercel,
  // pero nunca rompe el pedido si falla.
  try {
    const numArticulos = itemsValidados.reduce((sum, item) => sum + item.cantidad, 0);
    // Ojo: este aviso sale al CREAR el pedido, antes de que el cliente
    // pague. Por eso el pago en línea se anuncia como pendiente; cuando
    // Mercado Pago confirme, el webhook manda un segundo aviso.
    const cuando = horaBonita(horaRecoleccion ?? '');
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
    const listaItems = itemsValidados
      .map((it) => {
        const prod = productoPorId.get(it.id);
        // El nombre a secas, sin las opciones entre paréntesis: van abajo
        // renglón por renglón, que es como se prepara el pedido.
        const base = (prod?.Nombre || it.nombre).trim();
        const partes = [`• <b>${it.cantidad}× ${base}</b>`];

        if (it.tamano) partes.push(`   Tamaño: ${it.tamano}`);
        for (const [grupo, valor] of Object.entries(it.opciones ?? {})) {
          if (valor) partes.push(`   ${grupo}: <b>${valor}</b>`);
        }
        for (const e of it.extras ?? []) partes.push(`   + ${e.nombre}`);

        // Los combos llevan su descripción, para no tener que consultar el
        // menú al prepararlos.
        const esCombo = ((prod?.Categoria ?? prod?.['Categoría']) || '')
          .toLowerCase()
          .includes('combo');
        const desc = (prod?.Descripcion || '').trim();
        if (esCombo && desc) partes.push(`   <i>${desc}</i>`);

        return partes.join('\n');
      })
      .join('\n\n');

    await enviarTelegram(
      `🔔 <b>Nuevo pedido ${idPedido}</b>\n` +
        `👤 ${usuario.name ?? 'Cliente'}\n` +
        `🛒 ${numArticulos} artículo${numArticulos === 1 ? '' : 's'} — <b>$${totalFinal.toFixed(2)}</b>\n` +
        `${formaPagoTexto}\n` +
        // Lo primero que necesita saber quien prepara: para cuándo es
        (cuando ? `⏰ <b>Para las ${cuando}</b>\n` : '') +
        `\n` +
        `${listaItems}` +
        (notas?.trim() ? `\n\n📝 ${notas.trim()}` : '')
    );
  } catch (error) {
    console.error('Error enviando aviso a Telegram:', error);
  }

  // 5. Cómo dijo el cliente que va a pagar. Se anota SIEMPRE al crear el
  // pedido, no solo en transferencia: el pago en línea solo se anotaba
  // cuando Mercado Pago confirmaba, así que un pago que nunca se confirmó
  // dejaba el pedido en "Sin registrar" para siempre y no había manera de
  // saber cómo se había intentado pagar.
  const metodoElegido = esTransferencia
    ? 'Transferencia'
    : pagoEnLinea
    ? METODO_PAGO_EN_LINEA
    : ''; // "al recoger": todavía no se sabe si pagará en efectivo o terminal
  try {
    const [colMetodo, colEstadoPago] = await Promise.all([
      ensureColumn('PEDIDOS', 'Metodo_Pago'),
      ensureColumn('PEDIDOS', 'Estado_Pago'),
    ]);
    if (metodoElegido) {
      await updateCell('PEDIDOS', filaPedido, colMetodo, metodoElegido);
      // "Pendiente" solo si dijo que pagaría ANTES de recoger. A quien
      // paga al recoger no se le marca: en "Mis pedidos" eso le saca un
      // botón de "pagar ahora" que nunca pidió.
      await updateCell('PEDIDOS', filaPedido, colEstadoPago, 'Pendiente');
    }
  } catch (error) {
    console.error('Error anotando la forma de pago:', error);
  }

  // 6. Pago en línea (opcional) — si falla, el pedido ya quedó creado y
  // el cliente simplemente paga al recoger.
  if (pagoEnLinea && mpConfigurado()) {
    try {
      const numArticulos = itemsValidados.reduce((sum, item) => sum + item.cantidad, 0);
      const preferencia = await crearPreferencia({
        idPedido,
        descripcion: `Pedido Moramango ${idPedido} (${numArticulos} artículo${numArticulos === 1 ? '' : 's'})`,
        total: totalFinal,
        baseUrl: baseUrlDesdeRequest(req),
      });

      if (preferencia) {
        // Se guarda el enlace de cobro para poder reenviárselo al cliente
        // si abandona el pago a medias, sin tener que rehacer el pedido.
        const colLink = await ensureColumn('PEDIDOS', 'Link_Pago');
        await updateCell('PEDIDOS', filaPedido, colLink, preferencia.checkoutUrl);
        return NextResponse.json({ success: true, idPedido, checkoutUrl: preferencia.checkoutUrl });
      }
      // Sin preferencia el cliente NO puede pagar en línea: se le avisa en
      // vez de mandarlo a la pantalla de "pedido recibido" creyendo que ya
      // quedó, para que pague al recoger a sabiendas.
      console.error('MP no devolvió enlace de cobro para', idPedido);
      return NextResponse.json({
        success: true,
        idPedido,
        avisoPago: 'No pudimos abrir el pago con tarjeta. Tu pedido quedó registrado; puedes pagarlo al recogerlo.',
      });
    } catch (error) {
      console.error('Error iniciando pago en línea:', error);
    }
  }

  return NextResponse.json({ success: true, idPedido });
}

