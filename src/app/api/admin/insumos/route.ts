/**
 * app/api/admin/insumos/route.ts
 *
 * Operación diaria del inventario (InsumoActivo). El catálogo base vive
 * en /api/admin/biblioteca.
 *
 * GET              → lista de activos con los datos de su biblioteca ya
 *                    unidos y los campos calculados (consumo/día,
 *                    alcanza para X días, alertas).
 * GET ?historial=  → historial de precios de compra de un insumo.
 * PATCH            → { id, accion, ... }
 *                    compra:  { cantidadCompra, precioTotal? }
 *                    conteo:  { cantidad }
 *                    ajustar: iguala el stock al conteo físico
 *                    status:  { valor }
 *
 * El stock SIEMPRE se guarda en unidad de receta. La compra llega en
 * unidad de compra y se convierte con la equivalencia de la biblioteca.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, getSheetData, updateCeldas, updateCell, updateCells } from '@/lib/googleSheets';
import { consumoPorInsumo, fechaCompraDesdeISO } from '@/lib/insumos';
import {
  aUnidadesReceta,
  clavesDeInsumo,
  COL_ACT,
  COL_BIB,
  COLS_COMPRAS,
  columnaEnUso,
  costoPorUnidadReceta,
  estaEnUso,
  HOJA_ACTIVOS,
  HOJA_BIBLIOTECA,
  HOJA_COMPRAS,
  prepararInventario,
  redondear,
  STATUS_INSUMO,
} from '@/lib/inventario';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { leerRecetas } from '@/lib/recetario';
import { getAdminSession } from '@/lib/roles';

const DIAS_ANALISIS = 7;

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  // ── Todo lo comprado, para tenerlo a la vista ──
  //
  // El historial por insumo ya existía, pero para saber "cuánto llevo
  // gastado" había que abrir uno por uno. Esto devuelve las compras de
  // todos juntas, de la más reciente a la más vieja.
  if (new URL(req.url).searchParams.get('compras')) {
    const compras = await getSheetData(HOJA_COMPRAS, { crudo: true });
    const lista = compras
      .map((c, i) => ({ c, fila: i + 2 }))
      .filter(({ c }) => (c.Nombre || '').trim() || (c.ID_Biblioteca || '').trim())
      .map(({ c, fila }) => ({
        fila,
        fecha: (c.Fecha || '').toString(),
        fechaISO: parsearFechaHora(c.Fecha)?.fechaISO ?? (c.Fecha || '').toString().slice(0, 10),
        idBiblioteca: c.ID_Biblioteca,
        nombre: c.Nombre || c.ID_Biblioteca,
        cantidad: parseFloat(c.Cantidad_Compra) || 0,
        unidad: c.Unidad_Compra || '',
        total: parseFloat(c.Precio_Total) || 0,
      }))
      .sort((a, b) => (b.fechaISO || '').localeCompare(a.fechaISO || ''));

    return NextResponse.json({
      compras: lista,
      gastoTotal: redondear(lista.reduce((s, c) => s + c.total, 0), 2),
    });
  }

  // ── Historial de precios de un insumo ──
  const historialId = new URL(req.url).searchParams.get('historial');
  if (historialId) {
    const compras = await getSheetData(HOJA_COMPRAS, { crudo: true });
    const historial = compras
      // Se guarda la fila real (índice + 2) ANTES de filtrar, para poder
      // borrar esa compra puntual desde el modal de historial.
      .map((c, i) => ({ c, fila: i + 2 }))
      .filter(({ c }) => c.ID_Biblioteca === historialId)
      .map(({ c, fila }) => ({
        fila,
        fecha: c.Fecha || '',
        fechaISO: parsearFechaHora(c.Fecha)?.fechaISO || '',
        cantidad: parseFloat(c.Cantidad_Compra) || 0,
        unidadCompra: c.Unidad_Compra || '',
        precioTotal: parseFloat(c.Precio_Total) || 0,
        precioUnidadCompra: parseFloat(c.Precio_Unidad_Compra) || 0,
        costoUnidadReceta: parseFloat(c.Costo_Unidad_Receta) || 0,
        orden: parsearFechaHora(c.Fecha)?.timestamp ?? 0,
      }))
      .sort((a, b) => b.orden - a.orden);
    return NextResponse.json({ historial });
  }

  const [activos, biblioteca, catalogo, pedidos, detalles] = await Promise.all([
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    leerRecetas(),
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  // Consumo real de los últimos DIAS_ANALISIS días (ventas × recetas)
  const inicio = new Date(Date.now() - (DIAS_ANALISIS - 1) * 86400000);
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(inicio);
  const get = (t: string) => parseInt(partes.find((p) => p.type === t)?.value ?? '0', 10);
  const corte = (get('year') * 10000 + get('month') * 100 + get('day')) * 1_000_000;

  const idsValidos = new Set(
    pedidos
      .filter((p) => p.Estado !== 'Cancelado')
      .filter((p) => (parsearFechaHora(p.Fecha_Hora)?.timestamp ?? 0) >= corte)
      .map((p) => p.ID_Pedido)
  );
  const consumo = consumoPorInsumo(
    detalles
      .filter((d) => idsValidos.has(d.ID_Pedido))
      .map((d) => ({ idProducto: d.ID_Producto, cantidad: parseInt(d.Cantidad) || 0 })),
    catalogo
  );

  // Índice de la biblioteca por ID (relación 1:1)
  const bibPorId = new Map(biblioteca.map((b) => [b.ID_Biblioteca, b]));

  const hoy = fechaHoyMTY();
  const [hy, hm, hd] = hoy.split('-').map(Number);
  const hoyMs = Date.UTC(hy, hm - 1, hd);

  const items = activos
    .map((a) => {
      const bib = bibPorId.get(a.ID_Biblioteca);
      if (!bib) return null; // activo huérfano
      if ((bib.Eliminado || '').toLowerCase() === 'si') return null;
      // Los que no están en uso viven solo en la biblioteca
      if (!estaEnUso(a.En_Uso)) return null;

      const equivalencia = parseFloat(bib.Equivalencia) || 1;
      const ultimoPrecio = parseFloat(bib.Ultimo_Precio_Compra) || 0;
      const stock = parseFloat(a.Stock_Actual) || 0;

      // Las recetas consumen en unidad de receta, igual que el stock.
      // Un insumo puede cubrir varios ingredientes de las recetas.
      const consumido = clavesDeInsumo(bib).reduce((t, c) => t + (consumo.get(c) || 0), 0);
      const consumoPorDia = consumido / DIAS_ANALISIS;
      const alcanzaParaDias = consumoPorDia > 0 ? stock / consumoPorDia : null;

      let nivel: 'rojo' | 'amarillo' | 'verde' | 'gris' = 'gris';
      if (consumoPorDia > 0) {
        if (stock <= 0 || alcanzaParaDias! <= 2) nivel = 'rojo';
        else if (alcanzaParaDias! <= 5) nivel = 'amarillo';
        else nivel = 'verde';
      }

      const infoCompra = parsearFechaHora(a.Ultima_Compra);
      const diasDesdeCompra = infoCompra
        ? Math.max(
            0,
            Math.round((hoyMs - new Date(infoCompra.fechaISO).getTime()) / 86400000)
          )
        : null;

      const conteoStr = a.Conteo_Fisico ?? '';
      const conteoFisico = conteoStr !== '' ? parseFloat(conteoStr) || 0 : null;

      // Cuánto comprar (en unidad de COMPRA) para cubrir el periodo
      const faltanteReceta = consumoPorDia > 0 ? Math.max(0, consumoPorDia * DIAS_ANALISIS - stock) : 0;

      return {
        id: a.ID_Activo || '',
        idBiblioteca: a.ID_Biblioteca || '',
        nombre: bib.Nombre || '',
        unidadCompra: bib.Unidad_Compra || '',
        unidadReceta: bib.Unidad_Receta || '',
        equivalencia,
        costoPorUnidadReceta: costoPorUnidadReceta(ultimoPrecio, equivalencia),
        // Para comparar al registrar la compra: si el precio subio,
        // conviene enterarse en el momento y no al cerrar el mes.
        ultimoPrecioCompra: redondear(ultimoPrecio, 2),
        categoria: bib.Categoria || '',
        proveedor: bib.Proveedor || '',
        stockActual: redondear(stock, 3),
        consumoPorDia: redondear(consumoPorDia, 3),
        alcanzaParaDias: alcanzaParaDias !== null ? redondear(alcanzaParaDias, 1) : null,
        nivel,
        sugerenciaCompra: redondear(faltanteReceta / (equivalencia || 1), 2),
        ultimaCompra: a.Ultima_Compra || '',
        ultimaCompraISO: infoCompra?.fechaISO ?? '',
        diasDesdeCompra,
        status: a.Status || '',
        conteoFisico,
        fechaConteo: a.Fecha_Conteo || '',
        diferencia: conteoFisico !== null ? redondear(conteoFisico - stock, 3) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ items, diasAnalisis: DIAS_ANALISIS });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const { id, accion, cantidadCompra, precioTotal, stockPrevio, cantidad, valor, fechaISO, fila, lecturas } =
    await req.json();
  const ACCIONES = ['compra', 'conteo', 'ajustar', 'status', 'uso', 'stock', 'fechaCompra', 'borrarCompra', 'conteoRapido'];
  if (!accion || !ACCIONES.includes(accion)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  // ── Conteo de varios insumos de un jalón ──
  //
  // Contar el local abriendo insumo por insumo son tres toques por cada
  // uno y ~60 insumos. Aquí llega la lista completa de lo que hay y se
  // guarda en un solo viaje: el conteo queda registrado con su fecha Y el
  // stock se iguala a lo contado, que es lo que significa "esto es lo que
  // hay". No se toca lo que no se capturó.
  if (accion === 'conteoRapido') {
    if (!Array.isArray(lecturas) || lecturas.length === 0) {
      return NextResponse.json({ error: 'No llegó ningún conteo' }, { status: 400 });
    }
    const activosHoja = await getSheetData(HOJA_ACTIVOS, { crudo: true });
    // Se acepta el ID del activo o el de su biblioteca, igual que el resto
    // de las acciones. La pantalla manda el del activo (ACT-001) y este
    // mapa solo tenia el de biblioteca (BIB-001): ningun renglon casaba y
    // el guardado fallaba con "ninguna cantidad era valida".
    const filaPorId = new Map<string, number>();
    activosHoja.forEach((a, i) => {
      if (a.ID_Activo) filaPorId.set(a.ID_Activo, i + 2);
      if (a.ID_Biblioteca) filaPorId.set(a.ID_Biblioteca, i + 2);
    });
    // Misma marca de tiempo que usan las demas acciones. Con una fecha
    // tipo 2026-08-18, Google Sheets la interpreta como fecha y la
    // guarda como numero de serie: al releerla salia "46252".
    const fechaHoy = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

    const cambios: { fila: number; col: number; valor: string | number }[] = [];
    let contados = 0;
    for (const l of lecturas as { id?: string; cantidad?: unknown }[]) {
      const filaA = filaPorId.get((l?.id ?? '').toString());
      const num = parseFloat((l?.cantidad ?? '').toString().replace(',', '.'));
      if (!filaA || isNaN(num) || num < 0) continue;
      const v = redondear(num, 3);
      cambios.push(
        { fila: filaA, col: COL_ACT.stock, valor: v },
        { fila: filaA, col: COL_ACT.conteoFisico, valor: v },
        { fila: filaA, col: COL_ACT.fechaConteo, valor: fechaHoy }
      );
      contados += 1;
    }
    if (cambios.length === 0) {
      return NextResponse.json({ error: 'Ninguna cantidad era válida' }, { status: 400 });
    }
    await updateCeldas(HOJA_ACTIVOS, cambios);
    return NextResponse.json({ success: true, contados });
  }

  // ── Borrar una compra del historial ──
  // No depende de un insumo activo: opera directo sobre la fila de
  // Compras_Insumos. Se vacía la fila (no se borra) para no correr los
  // índices de las demás; el historial ignora las filas vacías.
  if (accion === 'borrarCompra') {
    const nFila = parseInt(fila, 10);
    if (isNaN(nFila) || nFila < 2) {
      return NextResponse.json({ error: 'Compra inválida' }, { status: 400 });
    }
    const vacias: Record<number, string> = {};
    for (let c = 1; c <= COLS_COMPRAS.length; c++) vacias[c] = '';
    await updateCells(HOJA_COMPRAS, nFila, vacias);
    return NextResponse.json({ success: true });
  }

  if (!id) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const [activos, biblioteca] = await Promise.all([
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
  ]);
  // Se acepta el ID del activo o el de su biblioteca (relación 1:1), para
  // poder accionar desde cualquiera de las dos pestañas.
  const idx = activos.findIndex((a) => a.ID_Activo === id || a.ID_Biblioteca === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Insumo activo no encontrado' }, { status: 404 });
  }
  const activo = activos[idx];
  const filaAct = idx + 2;

  const idxBib = biblioteca.findIndex((b) => b.ID_Biblioteca === activo.ID_Biblioteca);
  if (idxBib === -1) {
    return NextResponse.json({ error: 'Este insumo no existe en la biblioteca' }, { status: 400 });
  }
  const bib = biblioteca[idxBib];
  const filaBib = idxBib + 2;
  const equivalencia = parseFloat(bib.Equivalencia) || 1;
  const stockActual = parseFloat(activo.Stock_Actual) || 0;
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  // ── Registrar una compra ──
  if (accion === 'compra') {
    const cant = parseFloat(cantidadCompra);
    if (isNaN(cant) || cant <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }

    /**
     * De cuánto se parte para sumar la compra.
     *
     * Normalmente es lo que el sistema traía, pero al llegar mercancía es
     * justo cuando se ve el estante: "tenía medio kilo y llegaron tres".
     * Si se manda `stockPrevio`, esa cuenta manda sobre la del sistema y
     * queda registrada como conteo del día, para que se sepa de dónde
     * salió el número y no parezca un ajuste sin explicación.
     */
    const previo = parseFloat(stockPrevio);
    const hayPrevio = stockPrevio !== undefined && stockPrevio !== null && stockPrevio !== ''
      && !isNaN(previo) && previo >= 0;
    const base = hayPrevio ? previo : stockActual;

    // a) Sumar al stock, convirtiendo compra → receta. Las celdas del
    // activo en un solo viaje a Google.
    const enReceta = aUnidadesReceta(cant, equivalencia);
    const nuevoStock = redondear(base + enReceta, 3);
    const celdas: Record<number, string | number> = {
      [COL_ACT.stock]: nuevoStock,
      [COL_ACT.ultimaCompra]: fecha,
      [COL_ACT.status]: 'Fresco', // una compra fresca reinicia el status
    };
    if (hayPrevio) {
      celdas[COL_ACT.conteoFisico] = redondear(previo, 3);
      celdas[COL_ACT.fechaConteo] = fecha;
    }
    await updateCells(HOJA_ACTIVOS, filaAct, celdas);

    // b) Actualizar el último precio en la biblioteca (el padre)
    const precio = parseFloat(precioTotal);
    const conPrecio = !isNaN(precio) && precio > 0;
    let costoReceta: number | null = null;
    let precioPorUnidadCompra = 0;
    if (conPrecio) {
      precioPorUnidadCompra = redondear(precio / cant, 2);
      await updateCell(HOJA_BIBLIOTECA, filaBib, COL_BIB.ultimoPrecio, precioPorUnidadCompra);
      costoReceta = costoPorUnidadReceta(precioPorUnidadCompra, equivalencia);
    }

    // c) La compra SIEMPRE se anota, con precio o sin él. Antes solo se
    // guardaba si se capturaba el monto, así que una compra sin precio no
    // aparecía en "Lo que he comprado" y la lista mentía.
    await appendRow(HOJA_COMPRAS, [
      fecha,
      bib.ID_Biblioteca,
      bib.Nombre || '',
      cant,
      bib.Unidad_Compra || '',
      conPrecio ? redondear(precio, 2) : '',
      conPrecio ? precioPorUnidadCompra : '',
      equivalencia,
      costoReceta ?? '',
    ]);

    return NextResponse.json({
      success: true,
      stockActual: nuevoStock,
      agregadoEnReceta: enReceta,
      costoPorUnidadReceta: costoReceta,
    });
  }

  if (accion === 'fechaCompra') {
    const iso = (fechaISO || '').toString().trim();
    if (iso === '') {
      // Vacío = quitar la fecha de compra registrada
      await updateCell(HOJA_ACTIVOS, filaAct, COL_ACT.ultimaCompra, '');
      return NextResponse.json({ success: true });
    }
    const fechaMx = fechaCompraDesdeISO(iso);
    if (!fechaMx) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    }
    await updateCell(HOJA_ACTIVOS, filaAct, COL_ACT.ultimaCompra, fechaMx);
    return NextResponse.json({ success: true });
  }

  // ── Corregir el stock a mano, sin tocar precios ni historial ──
  if (accion === 'stock') {
    const num = parseFloat(cantidad);
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    await updateCell(HOJA_ACTIVOS, filaAct, COL_ACT.stock, redondear(num, 3));
    return NextResponse.json({ success: true, stockActual: redondear(num, 3) });
  }

  if (accion === 'conteo') {
    const num = parseFloat(cantidad);
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    await updateCells(HOJA_ACTIVOS, filaAct, {
      [COL_ACT.conteoFisico]: redondear(num, 3),
      [COL_ACT.fechaConteo]: fecha,
    });
    return NextResponse.json({ success: true });
  }

  if (accion === 'ajustar') {
    const conteo = parseFloat(activo.Conteo_Fisico);
    if (isNaN(conteo)) {
      return NextResponse.json({ error: 'No hay conteo físico registrado' }, { status: 400 });
    }
    await updateCell(HOJA_ACTIVOS, filaAct, COL_ACT.stock, redondear(conteo, 3));
    return NextResponse.json({ success: true, stockActual: redondear(conteo, 3) });
  }

  // ── uso: mover entre "activos" y "solo biblioteca" ──
  if (accion === 'uso') {
    await updateCell(HOJA_ACTIVOS, filaAct, await columnaEnUso(), valor ? 'si' : 'no');
    return NextResponse.json({ success: true, enUso: !!valor });
  }

  // ── status ──
  if (valor && !STATUS_INSUMO.includes(valor)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }
  await updateCell(HOJA_ACTIVOS, filaAct, COL_ACT.status, valor || '');
  return NextResponse.json({ success: true });
}
