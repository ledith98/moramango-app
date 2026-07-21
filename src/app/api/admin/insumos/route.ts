/**
 * app/api/admin/insumos/route.ts
 *
 * GET   → Inventario de insumos con análisis de consumo:
 *         stock teórico, consumo diario (ventas reales de los últimos
 *         7 días × recetas de Catalogo, con merma), días restantes,
 *         nivel de alarma y compra sugerida; más el conteo físico y su
 *         diferencia contra el teórico. Excluye eliminados.
 * POST  → Crea un insumo nuevo (nombre, unidad, categoría, proveedor).
 * PATCH → { idInsumo, accion, cantidad?, valor? }
 *         restock: suma cantidad al Stock_Actual
 *         conteo:  guarda Conteo_Fisico + Fecha_Conteo
 *         ajustar: Stock_Actual = Conteo_Fisico (cuadre de inventario)
 *         ocultar: valor 'si'/'no' — lo saca de la vista y alertas
 *         eliminar: baja lógica (columna Eliminado)
 *
 * Columnas nuevas (Stock_Actual, Conteo_Fisico, Oculto, Eliminado, etc.)
 * se crean solas en la hoja Insumos la primera vez (ensureColumn).
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, ensureColumn, ensureSheet, getSheetData, updateCell } from '@/lib/googleSheets';
import {
  CATEGORIA_FRESCOS,
  consumoPorInsumo,
  DIAS_FRESCURA,
  fechaCompraDesdeISO,
  normalizarNombre,
} from '@/lib/insumos';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

const DIAS_ANALISIS = 7;
const HOJA_COMPRAS = 'Compras_Insumos';
const COLS_COMPRAS = ['Fecha', 'ID_Insumo', 'Nombre', 'Cantidad', 'Precio_Total', 'Precio_Unitario'];

const redondear = (n: number, decimales = 2) => {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
};

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Historial de precios de un insumo (para la gráfica de cómo ha cambiado)
  const historialId = new URL(req.url).searchParams.get('historial');
  if (historialId) {
    let compras: Record<string, string>[] = [];
    try {
      compras = await getSheetData(HOJA_COMPRAS);
    } catch {
      /* la hoja aún no existe */
    }
    const historial = compras
      .filter((c) => c.ID_Insumo === historialId)
      .map((c) => ({
        fecha: c.Fecha || '',
        fechaISO: parsearFechaHora(c.Fecha)?.fechaISO || '',
        cantidad: parseFloat(c.Cantidad) || 0,
        precioTotal: parseFloat(c.Precio_Total) || 0,
        precioUnitario: parseFloat(c.Precio_Unitario) || 0,
        orden: parsearFechaHora(c.Fecha)?.timestamp ?? 0,
      }))
      .sort((a, b) => b.orden - a.orden);
    return NextResponse.json({ historial });
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

  // Por cada insumo (por nombre normalizado), los productos cuyas recetas
  // lo usan. En Catalogo el nombre del producto es "ombre_Producto"
  // (falta la N en el encabezado real de la hoja).
  const recetasPorInsumo = new Map<string, Set<string>>();
  for (const c of catalogo) {
    const clave = normalizarNombre(c.Ingrediente);
    if (!clave) continue;
    const producto = (c['ombre_Producto'] || c['Nombre_Producto'] || '').toString().trim();
    if (!producto) continue;
    if (!recetasPorInsumo.has(clave)) recetasPorInsumo.set(clave, new Set());
    recetasPorInsumo.get(clave)!.add(producto);
  }
  const nombresEnRecetas = new Set(recetasPorInsumo.keys());

  // Los eliminados (baja lógica, como en Productos) no se muestran nunca;
  // los ocultos sí viajan al panel con su bandera para poder reactivarlos.
  const visibles = insumos.filter((ins) => (ins.Eliminado || '').toLowerCase() !== 'si');

  const resultado = visibles.map((ins) => {
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
      recetas: [...(recetasPorInsumo.get(clave) ?? [])],
      costoUnitario: parseFloat(ins['Costo por unidad']) || null,
      contacto: ins['Contacto Proveedor'] || '',
      oculto: (ins.Oculto || '').toLowerCase() === 'si',
    };
  });

  // Categorías fijas + las que ya se usan en la hoja (para el desplegable
  // y poder agregar nuevas sin tocar código).
  const categoriasEnUso = [
    ...new Set(visibles.map((i) => (i.Categoria || '').trim()).filter(Boolean)),
  ];

  return NextResponse.json({ insumos: resultado, diasAnalisis: DIAS_ANALISIS, categoriasEnUso });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idInsumo, accion, cantidad, valor, precioTotal, datos } = await req.json();

  const ACCIONES = ['restock', 'conteo', 'ajustar', 'categoria', 'fecha_compra', 'ocultar', 'eliminar', 'editar'];
  if (!idInsumo || !ACCIONES.includes(accion)) {
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
    // Categorías libres: se aceptan las fijas o cualquiera nueva que la
    // usuaria escriba (se limita el largo para no meter basura).
    const cat = (valor || '').toString().trim().slice(0, 40);
    const colCategoria = await ensureColumn('Insumos', 'Categoria');
    await updateCell('Insumos', filaInsumo, colCategoria, cat);
    return NextResponse.json({ success: true });
  }

  // Editar nombre y datos. Renombrar cascadea a Catalogo (Ingrediente)
  // para no romper la conexión receta↔insumo.
  if (accion === 'editar') {
    const nombreNuevo = (datos?.nombre || '').toString().trim();
    if (!nombreNuevo) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }
    const nombreViejo = (insumo['Nombre insumo'] || '').toString().trim();
    const claveNueva = normalizarNombre(nombreNuevo);

    // No permitir chocar con OTRO insumo (mismo nombre parte el consumo)
    const choca = insumos.some(
      (i, k) => k !== idx && normalizarNombre(i['Nombre insumo']) === claveNueva
    );
    if (choca) {
      return NextResponse.json({ error: 'Ya existe otro insumo con ese nombre' }, { status: 400 });
    }

    // B=Nombre insumo, C=Unidad Medida, E=Proveedor, F=Contacto Proveedor
    await updateCell('Insumos', filaInsumo, 2, nombreNuevo);
    await updateCell('Insumos', filaInsumo, 3, (datos?.unidad || '').toString().trim());
    await updateCell('Insumos', filaInsumo, 5, (datos?.proveedor || '').toString().trim());
    await updateCell('Insumos', filaInsumo, 6, (datos?.contacto || '').toString().trim());

    // Cascada del nombre a las recetas: Ingrediente es la columna C (3)
    // en Catalogo. Sin esto, renombrar rompería el vínculo receta↔insumo.
    if (normalizarNombre(nombreViejo) !== claveNueva) {
      const catalogo = await getSheetData('Catalogo');
      const claveVieja = normalizarNombre(nombreViejo);
      for (let k = 0; k < catalogo.length; k++) {
        if (normalizarNombre(catalogo[k].Ingrediente) === claveVieja) {
          await updateCell('Catalogo', k + 2, 3, nombreNuevo);
        }
      }
    }
    return NextResponse.json({ success: true });
  }

  // Ocultar/mostrar: lo saca de la vista y de las alertas sin perder su
  // historial (para insumos de temporada o que dejaste de usar por ahora)
  if (accion === 'ocultar') {
    if (valor !== 'si' && valor !== 'no') {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }
    const colOculto = await ensureColumn('Insumos', 'Oculto');
    await updateCell('Insumos', filaInsumo, colOculto, valor);
    return NextResponse.json({ success: true });
  }

  // Eliminar: baja lógica (mismo patrón que Productos). No se borra la
  // fila del Sheet: las recetas de Catalogo lo referencian por nombre y
  // el historial de consumo debe seguir cuadrando.
  if (accion === 'eliminar') {
    const colEliminado = await ensureColumn('Insumos', 'Eliminado');
    await updateCell('Insumos', filaInsumo, colEliminado, 'si');
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

    // Precio de esta compra (opcional): guarda el costo unitario actual y
    // deja registro en el historial para ver cómo ha cambiado el precio.
    const precio = parseFloat(precioTotal);
    if (!isNaN(precio) && precio > 0) {
      const unitario = redondear(precio / num, 2);
      // Columna D = "Costo por unidad" en la hoja Insumos
      await updateCell('Insumos', filaInsumo, 4, unitario);
      await ensureSheet(HOJA_COMPRAS, COLS_COMPRAS);
      await appendRow(HOJA_COMPRAS, [
        fechaCompra!,
        idInsumo,
        insumo['Nombre insumo'] || '',
        redondear(num, 3),
        redondear(precio, 2),
        unitario,
      ]);
    }
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

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, unidad, categoria, proveedor } = await req.json();

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const categoriaLimpia = (categoria || '').toString().trim().slice(0, 40);

  const insumos = await getSheetData('Insumos');

  // Las recetas de Catalogo se unen por NOMBRE: un duplicado partiría el
  // consumo entre dos filas y los números dejarían de cuadrar.
  const clave = normalizarNombre(nombre);
  if (insumos.some((i) => normalizarNombre(i['Nombre insumo']) === clave)) {
    return NextResponse.json(
      { error: 'Ya existe un insumo con ese nombre (aunque esté oculto o eliminado)' },
      { status: 400 }
    );
  }

  const nuevoId = `INS-${String(insumos.length + 1).padStart(3, '0')}`;
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  // Columnas A–G de la hoja Insumos
  const fila = await appendRow('Insumos', [
    nuevoId,                    // A ID Insumo
    nombre.trim(),              // B Nombre insumo
    (unidad || '').trim(),      // C Unidad Medida
    '',                         // D Costo por unidad
    (proveedor || '').trim(),   // E Proveedor
    '',                         // F Contacto Proveedor
    fecha,                      // G Ultima actualizacion
  ]);

  if (categoriaLimpia) {
    const colCategoria = await ensureColumn('Insumos', 'Categoria');
    await updateCell('Insumos', fila, colCategoria, categoriaLimpia);
  }

  return NextResponse.json({ success: true, id: nuevoId });
}
