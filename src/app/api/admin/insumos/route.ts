/**
 * app/api/admin/insumos/route.ts
 *
 * GET   → Inventario de insumos con análisis de consumo:
 *         stock teórico, consumo diario (ventas reales de los últimos
 *         7 días × recetas de Catalogo, con merma), días restantes,
 *         nivel de alarma y compra sugerida; más el conteo físico y su
 *         diferencia contra el teórico.
 * PATCH → { idInsumo, accion, cantidad? }
 *         restock: suma cantidad al Stock_Actual
 *         conteo:  guarda Conteo_Fisico + Fecha_Conteo
 *         ajustar: Stock_Actual = Conteo_Fisico (cuadre de inventario)
 *
 * Columnas Stock_Actual / Conteo_Fisico / Fecha_Conteo se crean solas
 * en la hoja Insumos la primera vez (ensureColumn).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureColumn, getSheetData, updateCell } from '@/lib/googleSheets';
import {
  CATEGORIA_FRESCOS,
  CATEGORIAS_INSUMOS,
  consumoPorInsumo,
  DIAS_FRESCURA,
  fechaCompraDesdeISO,
  normalizarNombre,
} from '@/lib/insumos';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

const DIAS_ANALISIS = 7;

const redondear = (n: number, decimales = 2) => {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
};

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const [insumos, catalogo, pedidos, detalles] = await Promise.all([
    getSheetData('Insumos'),
    getSheetData('Catalogo'),
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  // Corte: hoy (zona Monterrey) menos DIAS_ANALISIS-1 días, a las 00:00.
  // Mismo formato numérico empaquetado que parsearFechaHora (AAAAMMDDHHMMSS),
  // que ordena cronológicamente.
  const inicio = new Date(Date.now() - (DIAS_ANALISIS - 1) * 24 * 60 * 60 * 1000);
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

  const itemsVendidos = detalles
    .filter((d) => idsValidos.has(d.ID_Pedido))
    .map((d) => ({ idProducto: d.ID_Producto, cantidad: parseInt(d.Cantidad) || 0 }));

  const consumo = consumoPorInsumo(itemsVendidos, catalogo);
  const nombresEnRecetas = new Set(
    catalogo.map((c) => normalizarNombre(c.Ingrediente)).filter(Boolean)
  );

  const resultado = insumos.map((ins) => {
    const clave = normalizarNombre(ins['Nombre insumo']);
    const stock = parseFloat(ins.Stock_Actual) || 0;
    const consumido = consumo.get(clave) || 0;
    const consumoDiario = consumido / DIAS_ANALISIS;
    const diasRestantes = consumoDiario > 0 ? stock / consumoDiario : null;

    let nivel: 'rojo' | 'amarillo' | 'verde' | 'gris' = 'gris';
    if (consumoDiario > 0) {
      if (stock <= 0 || diasRestantes! <= 2) nivel = 'rojo';
      else if (diasRestantes! <= 5) nivel = 'amarillo';
      else nivel = 'verde';
    }

    const sugerenciaCompra =
      consumoDiario > 0 ? Math.max(0, consumoDiario * DIAS_ANALISIS - stock) : 0;

    const conteoStr = ins.Conteo_Fisico ?? '';
    const conteoFisico = conteoStr !== '' ? parseFloat(conteoStr) || 0 : null;

    // Fecha de la última compra y días transcurridos (para frescura)
    const fechaCompra = ins.Fecha_Compra || '';
    const infoCompra = parsearFechaHora(fechaCompra);
    const diasDesdeCompra = infoCompra
      ? Math.max(
          0,
          Math.round(
            (new Date(fechaHoyMTY()).getTime() - new Date(infoCompra.fechaISO).getTime()) /
              86400000
          )
        )
      : null;

    const categoria = ins.Categoria || '';
    // fresco: solo aplica a la categoría de frescos y si hay fecha de compra
    const fresco =
      categoria === CATEGORIA_FRESCOS && diasDesdeCompra !== null
        ? diasDesdeCompra <= DIAS_FRESCURA
        : null;

    return {
      categoria,
      fechaCompra,
      diasDesdeCompra,
      fresco,
      id: ins['ID Insumo'] || '',
      nombre: ins['Nombre insumo'] || '',
      unidad: ins['Unidad Medida'] || '',
      proveedor: ins.Proveedor || '',
      stock: redondear(stock, 3),
      consumoDiario: redondear(consumoDiario),
      diasRestantes: diasRestantes !== null ? redondear(diasRestantes, 1) : null,
      nivel,
      sugerenciaCompra: redondear(sugerenciaCompra, 1),
      conteoFisico,
      fechaConteo: ins.Fecha_Conteo || '',
      diferencia: conteoFisico !== null ? redondear(conteoFisico - stock, 3) : null,
      // ISO (YYYY-MM-DD) para prellenar el <input type="date"> del panel
      fechaCompraISO: infoCompra?.fechaISO ?? '',
      enRecetas: nombresEnRecetas.has(clave),
    };
  });

  return NextResponse.json({ insumos: resultado, diasAnalisis: DIAS_ANALISIS });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idInsumo, accion, cantidad, valor } = await req.json();

  if (!idInsumo || !['restock', 'conteo', 'ajustar', 'categoria', 'fecha_compra'].includes(accion)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const insumos = await getSheetData('Insumos');
  const idx = insumos.findIndex((i) => i['ID Insumo'] === idInsumo);
  if (idx === -1) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });
  }
  const filaInsumo = idx + 2;
  const insumo = insumos[idx];

  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });
  const colStock = await ensureColumn('Insumos', 'Stock_Actual');
  const colUltima = await ensureColumn('Insumos', 'Ultima actualizacion');

  if (accion === 'categoria') {
    if (valor !== '' && !CATEGORIAS_INSUMOS.includes(valor)) {
      return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 });
    }
    const colCategoria = await ensureColumn('Insumos', 'Categoria');
    await updateCell('Insumos', filaInsumo, colCategoria, valor);
    return NextResponse.json({ success: true });
  }

  // Ajustar manualmente la fecha de compra (valor = YYYY-MM-DD, o '' para limpiar)
  if (accion === 'fecha_compra') {
    const colFechaCompra = await ensureColumn('Insumos', 'Fecha_Compra');
    if (valor === '') {
      await updateCell('Insumos', filaInsumo, colFechaCompra, '');
      return NextResponse.json({ success: true });
    }
    const fechaCanonica = fechaCompraDesdeISO(valor);
    if (!fechaCanonica) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    }
    await updateCell('Insumos', filaInsumo, colFechaCompra, fechaCanonica);
    return NextResponse.json({ success: true });
  }

  if (accion === 'restock') {
    const num = parseFloat(cantidad);
    if (isNaN(num) || num <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    // Fecha de compra: la indicada (YYYY-MM-DD) o, si no se dio, hoy
    const fechaCompra = valor ? fechaCompraDesdeISO(valor) : fecha;
    if (valor && !fechaCompra) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
    }
    const nuevoStock = (parseFloat(insumo.Stock_Actual) || 0) + num;
    const colFechaCompra = await ensureColumn('Insumos', 'Fecha_Compra');
    await updateCell('Insumos', filaInsumo, colStock, redondear(nuevoStock, 3));
    await updateCell('Insumos', filaInsumo, colFechaCompra, fechaCompra!);
    await updateCell('Insumos', filaInsumo, colUltima, fecha);
    return NextResponse.json({ success: true, stock: redondear(nuevoStock, 3) });
  }

  if (accion === 'conteo') {
    const num = parseFloat(cantidad);
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    const colConteo = await ensureColumn('Insumos', 'Conteo_Fisico');
    const colFechaConteo = await ensureColumn('Insumos', 'Fecha_Conteo');
    await updateCell('Insumos', filaInsumo, colConteo, redondear(num, 3));
    await updateCell('Insumos', filaInsumo, colFechaConteo, fecha);
    return NextResponse.json({ success: true });
  }

  // ajustar: iguala el stock teórico al último conteo físico
  const conteo = parseFloat(insumo.Conteo_Fisico);
  if (isNaN(conteo)) {
    return NextResponse.json(
      { error: 'No hay conteo físico registrado para este insumo' },
      { status: 400 }
    );
  }
  await updateCell('Insumos', filaInsumo, colStock, redondear(conteo, 3));
  await updateCell('Insumos', filaInsumo, colUltima, fecha);
  return NextResponse.json({ success: true, stock: redondear(conteo, 3) });
}
