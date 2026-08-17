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
import { leerAjustes } from '@/lib/ajustes';
import { appendRow, ensureColumn, getSheetData, updateCell } from '@/lib/googleSheets';
import { actualizarLealtad, descuentoPorBeneficio } from '@/lib/lealtad';
import { getAdminSession } from '@/lib/roles';
import { moverStockDePedido } from '@/lib/stock';
import { validarItems } from '@/lib/preciosServidor';

const ESTADOS_VALIDOS = [
  'Recibido',
  'En preparación',
  'Listo para recoger',
  'Entregado',
  'Cancelado',
];

const METODOS_PAGO = ['Efectivo', 'Terminal', 'Transferencia'];

/**
 * Revisa el descuento manual del mostrador. Se exporta para poder probarla
 * sin sesión de administrador.
 *
 * Reglas: no negativo, no puede pasarse del total de la venta (sumado a lo
 * que ya descuenta la lealtad) y siempre lleva motivo, para que en el corte
 * se pueda saber por qué se cobró de menos.
 */
export function revisarDescuentoManual(
  monto: unknown,
  motivo: unknown,
  descuentoActual: number,
  totalBruto: number
): { ok: true; monto: number; motivo: string } | { ok: false; error: string } {
  if (monto === undefined || monto === null || monto === '') {
    return { ok: true, monto: 0, motivo: '' };
  }
  const n = parseFloat(monto.toString().replace(',', '.'));
  if (isNaN(n) || n < 0) return { ok: false, error: 'Descuento manual inválido' };
  if (descuentoActual + n > totalBruto + 0.001) {
    return { ok: false, error: 'El descuento no puede ser mayor que el total de la venta' };
  }
  const texto = (motivo ?? '').toString().trim();
  if (n > 0 && !texto) return { ok: false, error: 'Escribe el motivo del descuento manual' };
  return { ok: true, monto: n, motivo: texto };
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, telefono, metodoPago, estado, notas, items, estadoPago, idUsuario, beneficioCanjeado, efectivoRecibido, cambio, articuloGratisId, descuentoManual, motivoDescuento } =
    await req.json();

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'El nombre del cliente es obligatorio' }, { status: 400 });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'La venta no tiene productos' }, { status: 400 });
  }
  if (!METODOS_PAGO.includes(metodoPago)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }
  // En efectivo, el monto recibido es obligatorio (para el corte de caja).
  // La cobertura del total se revalida más abajo, ya calculado el total.
  if (metodoPago === 'Efectivo' && (efectivoRecibido === undefined || isNaN(parseFloat(efectivoRecibido)))) {
    return NextResponse.json(
      { error: 'Falta registrar con cuánto pagó el cliente en efectivo' },
      { status: 400 }
    );
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

  // El precio lo pone la hoja, no el navegador: con tamaños hay varios
  // precios válidos por producto y el mostrador debe cobrar el correcto.
  const validacion = await validarItems(items);
  if (!validacion.ok) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const itemsValidados = validacion.items;
  const totalBruto = validacion.total;

  // Lealtad: si la venta se ligó a un cliente, se le puede canjear su
  // beneficio y el pedido le suma a su ciclo (igual que en la app).
  const canjea = idUsuario && beneficioCanjeado && beneficioCanjeado !== 'Ninguno'
    ? beneficioCanjeado
    : 'Ninguno';

  // El artículo gratis se descuenta solo: el cajero elige cuál de los
  // productos del carrito se regala y aquí se resta su precio. El tope se
  // valida contra el ajuste guardado, no contra lo que mande el navegador.
  let descuento = descuentoPorBeneficio(canjea, totalBruto);
  let nombreArticuloGratis = '';
  if (canjea === 'Articulo Gratis' && articuloGratisId) {
    const { topeArticuloGratis } = await leerAjustes();
    // Se busca por producto + tamaño: el mismo jugo puede estar en la
    // venta en 500 ml y en 1 litro, a precios distintos.
    const elegido = itemsValidados.find((i) => i.clave === articuloGratisId);
    if (!elegido) {
      return NextResponse.json(
        { error: 'El artículo gratis elegido no está en la venta' },
        { status: 400 }
      );
    }
    const precio = elegido.precio;
    if (precio > topeArticuloGratis) {
      return NextResponse.json(
        { error: `El artículo gratis no puede costar más de $${topeArticuloGratis}` },
        { status: 400 }
      );
    }
    descuento += precio; // solo una pieza, aunque lleve varias
    nombreArticuloGratis = elegido.nombre;
  }
  // Descuento manual: para cosas fuera de lo normal (una disculpa, un
  // acuerdo con un cliente). Se suma a lo que ya trae de lealtad.
  const revisionDescuento = revisarDescuentoManual(
    descuentoManual,
    motivoDescuento,
    descuento,
    totalBruto
  );
  if (!revisionDescuento.ok) {
    return NextResponse.json({ error: revisionDescuento.error }, { status: 400 });
  }
  const descuentoExtra = revisionDescuento.monto;
  const motivoLimpio = revisionDescuento.motivo;
  descuento += descuentoExtra;

  const total = Math.max(0, totalBruto - descuento);

  if (metodoPago === 'Efectivo' && parseFloat(efectivoRecibido) + 0.001 < total) {
    return NextResponse.json(
      { error: 'El efectivo recibido no cubre el total' },
      { status: 400 }
    );
  }

  // Resolver el cliente. Antes, una venta de mostrador con nombre+teléfono
  // NO quedaba registrada: la próxima vez no se encontraba al cliente y su
  // lealtad nunca acumulaba. Ahora, si no se ligó a un cliente existente
  // pero hay teléfono, se busca por teléfono o se da de alta uno nuevo.
  let idCliente = (idUsuario || '').toString().trim();
  const telLimpio = typeof telefono === 'string' ? telefono.trim() : '';
  if (!idCliente && telLimpio) {
    const usuarios = await getSheetData('USUARIOS');
    // Compara por los últimos 10 dígitos (el número local) para que el
    // mismo cliente no se duplique aunque un día se escriba con lada (+52)
    // y otro sin ella.
    const clave = (t: string) => {
      const d = (t || '').replace(/\D/g, '');
      return d.length >= 10 ? d.slice(-10) : d;
    };
    const claveTel = clave(telLimpio);
    const existente =
      claveTel.length >= 7
        ? usuarios.find((u) => clave(u.Telefono) === claveTel)
        : undefined;
    if (existente) {
      idCliente = existente.ID_Usuario; // ya existía (app o mostrador previo)
    } else {
      // ID por el máximo existente, no por el conteo (evita choques si se
      // borró alguna fila)
      const maxN = usuarios.reduce((m, u) => {
        const n = parseInt((u.ID_Usuario || '').replace(/\D/g, ''), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      idCliente = `USR-${String(maxN + 1).padStart(3, '0')}`;
      await appendRow('USUARIOS', [
        idCliente,          // A ID_Usuario
        nombre.trim(),      // B Nombre
        telLimpio,          // C Telefono
        'cliente',          // D Rol
        '',                 // E Email (mostrador, sin cuenta de Google)
        fechaStr,           // F Fecha_Registro
        0,                  // G Ciclo_Actual
        0,                  // H Total_Articulos_Historico
        'Ninguno',          // I Beneficio_Disponible
        'Alta desde mostrador', // J Notas_Admin
        'si',               // K Activo
        fechaStr,           // L Ultimo_Acceso
      ]);
    }
  }

  // Fila en PEDIDOS — venta de mostrador
  const filaPedido = await appendRow('PEDIDOS', [
    idPedido,
    idCliente,                                // ID_Usuario — cliente ligado o recién creado
    nombre.trim(),                            // Nombre_Cliente_Snap
    fechaStr,
    estadoInicial,
    '',                                       // Hora_Recoleccion
    totalBruto,                               // Total_Bruto
    canjea,                                   // Beneficio_Canjeado
    descuento,                                // Descuento_Monto
    total,                                    // Total_Final
    // Queda anotado qué se regaló y por qué se descontó, para poder
    // revisarlo después en el corte o en Pedidos
    [
      notas?.trim(),
      nombreArticuloGratis ? `🎁 Gratis: ${nombreArticuloGratis}` : '',
      descuentoExtra > 0 ? `🏷️ Descuento manual $${descuentoExtra}: ${motivoLimpio}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
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

  // Efectivo: con cuánto pagó y cuánto se le regresó, de registro
  const recibido = parseFloat(efectivoRecibido);
  if (metodoPago === 'Efectivo' && !isNaN(recibido) && recibido > 0) {
    const colRecibido = await ensureColumn('PEDIDOS', 'Efectivo_Recibido');
    await updateCell('PEDIDOS', filaPedido, colRecibido, Math.round(recibido * 100) / 100);
    const colCambio = await ensureColumn('PEDIDOS', 'Cambio');
    await updateCell('PEDIDOS', filaPedido, colCambio, Math.round((parseFloat(cambio) || 0) * 100) / 100);
  }

  // Estado del cobro.
  //
  // Efectivo y terminal se cobran en el momento, así que no hace falta
  // marcar nada. La transferencia es la que se puede quedar sin llegar:
  // si al registrar la venta no se confirmó que el dinero cayó, queda
  // 'Pendiente' para que salga en el aviso de Pedidos y no se pierda de
  // vista. Marcarla como recibida ahí mismo la deja en 'Pagado'.
  const estadoCobro =
    estadoPago === 'Pagado'
      ? 'Pagado'
      : metodoPago === 'Transferencia'
      ? 'Pendiente'
      : '';
  if (estadoCobro) {
    const colEstadoPago = await ensureColumn('PEDIDOS', 'Estado_Pago');
    await updateCell('PEDIDOS', filaPedido, colEstadoPago, estadoCobro);
  }

  // Detalle de items
  const dtExistentes = await getSheetData('DT PEDIDOS');
  for (let i = 0; i < itemsValidados.length; i++) {
    const item = itemsValidados[i];
    const idDetalle = `DET-${String(dtExistentes.length + i + 1).padStart(4, '0')}`;

    await appendRow('DT PEDIDOS', [
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
  }

  // La venta en mostrador consume igual que un pedido de la app
  await moverStockDePedido(idPedido, 'apartar');

  // Lealtad del cliente (ligado, o recién creado desde el mostrador)
  if (idCliente) {
    await actualizarLealtad(idCliente, canjea);
  }

  return NextResponse.json({ success: true, idPedido, total, descuento });
}
