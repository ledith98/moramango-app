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
import { anotar } from '@/lib/bitacora';
import { cerrarPedidosPendientes, MINUTOS_PARA_CERRAR_SOLO } from '@/lib/cierreDia';
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

/**
 * Cuándo se barrió por última vez, para no hacerlo en cada carga.
 *
 * El barrido lee la hoja entera, y la pantalla de pedidos se recarga
 * sola cada pocos segundos. Sin este freno se comería la cuota de Google
 * y escribiría lo mismo una y otra vez. Vive en memoria: si el servidor
 * se reinicia, el peor caso es un barrido de más.
 */
let ultimoBarrido = 0;
const CADA_MS = 10 * 60 * 1000;

/**
 * Cierra solos los pedidos que llevan más de media hora sin moverse.
 *
 * Va aquí y no en una tarea programada porque las tareas de Vercel
 * corren una vez al día: para que el pedido de las 9 de la mañana esté
 * cerrado a las 10, el barrido tiene que pasar mientras alguien usa el
 * panel — que es justo cuando importa que la pantalla esté limpia.
 *
 * Nunca interrumpe: si falla, se anota y la lista se devuelve igual.
 */
async function barrerPendientes(quien: string): Promise<void> {
  const ahora = Date.now();
  if (ahora - ultimoBarrido < CADA_MS) return;
  ultimoBarrido = ahora;
  try {
    await cerrarPedidosPendientes({
      minutos: MINUTOS_PARA_CERRAR_SOLO,
      quien,
      motivo: `Pasó más de ${MINUTOS_PARA_CERRAR_SOLO} min sin moverse`,
    });
  } catch (e) {
    console.error('No se pudieron cerrar los pedidos viejos:', e);
  }
}

// ── GET: pedidos filtrados por fecha (default hoy) y estado opcional ─────────
export async function GET(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await barrerPendientes(sesion.user?.name || sesion.user?.email || 'Panel');

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

  const [pedidos, usuarios, detalles] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('USUARIOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  const telefonoPorUsuario = new Map(usuarios.map((u) => [u.ID_Usuario, u.Telefono || '']));

  /**
   * Qué se llevó cada pedido, para poder filtrar por producto.
   *
   * El nombre guardado trae las opciones elegidas entre paréntesis
   * ("Combo Croissant (Fresa · Si)"). Para agrupar hay que quitarlas, o
   * el mismo combo aparecería como cinco productos distintos según lo que
   * haya pedido cada quien.
   */
  const nombreBase = (snap: string) => (snap || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
  const productosPorPedido = new Map<string, { id: string; nombre: string; cantidad: number }[]>();
  for (const d of detalles) {
    if (!d.ID_Pedido) continue;
    const nombre = nombreBase(d.Nombre_Producto_Snap);
    if (!nombre) continue;
    const lista = productosPorPedido.get(d.ID_Pedido) ?? [];
    // El vínculo es por ID; el nombre es solo la etiqueta. Si un pedido
    // trae el mismo producto en dos renglones (tamaños distintos), se suman.
    const clave = d.ID_Producto || nombre;
    const ya = lista.find((x) => x.id === clave);
    const cantidad = parseInt(d.Cantidad) || 0;
    if (ya) ya.cantidad += cantidad;
    else lista.push({ id: clave, nombre, cantidad });
    productosPorPedido.set(d.ID_Pedido, lista);
  }

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
      Productos: productosPorPedido.get(pedido.ID_Pedido) ?? [],
    }));

  return NextResponse.json({ pedidos: delDia });
}

// ── PATCH: cambiar estado y/o método de pago de un pedido ────────────────────
// 'Mercado Pago' se acepta por compatibilidad con pedidos viejos
const METODOS_PAGO = ['Efectivo', 'Terminal', 'Transferencia', METODO_PAGO_EN_LINEA, 'Mercado Pago'];

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = sesion.user?.name || sesion.user?.email || '';

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

  /**
   * No se entrega nada sin saber cómo se pagó.
   *
   * Los pedidos de la app que eligen pagar al recoger nacen sin método:
   * el cliente todavía no ha pagado nada. Si nadie lo anota al entregar,
   * ahí se queda vacío para siempre — y la app lo cuenta como efectivo
   * por defecto, así que un cobro por terminal acaba sumando al cajón y
   * el corte del día no cuadra. Ya pasó con cuatro pedidos.
   *
   * Marcar Entregado es justo el momento en que se sabe la respuesta,
   * porque es cuando se cobra. Se puede mandar el método en la misma
   * llamada; si no viene y el pedido no lo tiene, no se entrega.
   */
  const metodoActual = (pedidoRow.data.Metodo_Pago || '').toString().trim();
  if (nuevoEstado === 'Entregado' && !metodoActual && !metodoPago) {
    return NextResponse.json(
      {
        error: 'Falta decir cómo se pagó este pedido.',
        codigo: 'FALTA_METODO_PAGO',
        metodos: METODOS_PAGO,
      },
      { status: 400 }
    );
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

  const detalle = [
    nuevoEstado ? `estado: ${pedidoRow.data.Estado || '(vacío)'} → ${nuevoEstado}` : '',
    metodoPago ? `cobro: ${pedidoRow.data.Metodo_Pago || '(sin registrar)'} → ${metodoPago}` : '',
    estadoPago ? `pago: ${pedidoRow.data.Estado_Pago || '(vacío)'} → ${estadoPago}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (detalle) {
    await anotar(
      quien,
      'Pedidos',
      `${nuevoEstado === 'Cancelado' ? 'Canceló' : 'Cambió'} el pedido ${idPedido}`,
      `${detalle} · $${pedidoRow.data.Total_Final || '0'}`
    );
  }

  return NextResponse.json({ success: true });
}


