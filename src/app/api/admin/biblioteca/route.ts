/**
 * app/api/admin/biblioteca/route.ts
 *
 * CRUD del catálogo base de insumos (BibliotecaInsumo).
 *
 * GET   → lista con costo por unidad de receta ya calculado.
 * POST  → crea un insumo en la biblioteca y, por la relación 1:1, su
 *         InsumoActivo con stock 0.
 * PATCH → { id, accion: 'editar' | 'eliminar', datos? }
 *         Renombrar cascadea a la columna Ingrediente de Catalogo para
 *         no romper el vínculo receta↔insumo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, getSheetData, updateCell } from '@/lib/googleSheets';
import { normalizarNombre } from '@/lib/insumos';
import {
  clavesDeInsumo,
  COL_BIB,
  columnaIngredientes,
  costoPorUnidadReceta,
  escribirIngredientes,
  estaEnUso,
  HOJA_ACTIVOS,
  HOJA_BIBLIOTECA,
  leerIngredientes,
  prepararInventario,
} from '@/lib/inventario';
import { getAdminSession } from '@/lib/roles';

const vivos = (filas: Record<string, string>[]) =>
  filas.filter((b) => (b.Eliminado || '').toLowerCase() !== 'si');

/** Ingredientes distintos de Catalogo, con los productos que los usan. */
function ingredientesDelCatalogo(catalogo: Record<string, string>[]) {
  const mapa = new Map<string, { nombre: string; productos: Set<string> }>();
  for (const c of catalogo) {
    const nombre = (c.Ingrediente || '').toString().trim();
    if (!nombre) continue;
    // En Catalogo el encabezado del producto perdió la N inicial en algún
    // momento; se aceptan las dos formas.
    const producto = (c['Nombre_Producto'] || c['ombre_Producto'] || '').toString().trim();
    const clave = normalizarNombre(nombre);
    if (!mapa.has(clave)) mapa.set(clave, { nombre, productos: new Set() });
    if (producto) mapa.get(clave)!.productos.add(producto);
  }
  return mapa;
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const [biblioteca, catalogo, activos] = await Promise.all([
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    getSheetData('Catalogo'),
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
  ]);

  const porIngrediente = ingredientesDelCatalogo(catalogo);

  // ── Catálogo de ingredientes para el modal de vinculación ──
  if (new URL(req.url).searchParams.get('ingredientes')) {
    // Qué insumo reclama ya cada ingrediente, para no duplicar descuentos
    const dueño = new Map<string, string>();
    for (const b of vivos(biblioteca)) {
      for (const clave of clavesDeInsumo(b)) {
        if (leerIngredientes(b.Ingredientes).length > 0) dueño.set(clave, b.Nombre || '');
      }
    }
    const ingredientes = [...porIngrediente.entries()]
      .map(([clave, v]) => ({
        nombre: v.nombre,
        productos: [...v.productos].sort(),
        vinculadoA: dueño.get(clave) ?? '',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return NextResponse.json({ ingredientes });
  }

  // Relación 1:1 — para saber si el insumo se está usando hoy
  const activoPorBib = new Map(activos.map((a) => [a.ID_Biblioteca, a]));

  const items = vivos(biblioteca).map((b) => {
    const equivalencia = parseFloat(b.Equivalencia) || 1;
    const ultimoPrecio = parseFloat(b.Ultimo_Precio_Compra) || 0;
    const ingredientes = leerIngredientes(b.Ingredientes);

    // Productos alcanzados por este insumo, vía vínculo manual o por nombre
    const recetas = new Set<string>();
    for (const clave of clavesDeInsumo(b)) {
      for (const p of porIngrediente.get(clave)?.productos ?? []) recetas.add(p);
    }

    return {
      id: b.ID_Biblioteca || '',
      nombre: b.Nombre || '',
      unidadCompra: b.Unidad_Compra || '',
      unidadReceta: b.Unidad_Receta || '',
      equivalencia,
      ultimoPrecioCompra: ultimoPrecio,
      // Campo virtual: no se almacena, se calcula al leer
      costoPorUnidadReceta: costoPorUnidadReceta(ultimoPrecio, equivalencia),
      categoria: b.Categoria || '',
      proveedor: b.Proveedor || '',
      contacto: b.Contacto_Proveedor || '',
      ingredientes,
      /** true = el vínculo es automático por nombre, no declarado a mano */
      vinculoAutomatico: ingredientes.length === 0,
      recetas: [...recetas].sort(),
      enUso: estaEnUso(activoPorBib.get(b.ID_Biblioteca)?.En_Uso),
    };
  });

  const categoriasEnUso = [...new Set(items.map((i) => i.categoria).filter(Boolean))];
  return NextResponse.json({ items, categoriasEnUso });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const { nombre, unidadCompra, unidadReceta, equivalencia, categoria, proveedor, contacto } =
    await req.json();

  if (!nombre || !nombre.toString().trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const equiv = parseFloat(equivalencia);
  if (isNaN(equiv) || equiv <= 0) {
    return NextResponse.json(
      { error: 'La equivalencia debe ser mayor a 0 (ej. 1 Litro = 1000 ml)' },
      { status: 400 }
    );
  }

  const [biblioteca, activos] = await Promise.all([
    getSheetData(HOJA_BIBLIOTECA),
    getSheetData(HOJA_ACTIVOS),
  ]);

  // Las recetas se unen por nombre: un duplicado partiría el consumo
  const clave = normalizarNombre(nombre);
  if (biblioteca.some((b) => normalizarNombre(b.Nombre) === clave)) {
    return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 400 });
  }

  const idBib = `BIB-${String(biblioteca.length + 1).padStart(3, '0')}`;
  await appendRow(HOJA_BIBLIOTECA, [
    idBib,
    nombre.toString().trim(),
    (unidadCompra || '').toString().trim(),
    (unidadReceta || '').toString().trim(),
    equiv,
    '', // Ultimo_Precio_Compra — se llena con la primera compra
    (categoria || '').toString().trim().slice(0, 40),
    (proveedor || '').toString().trim(),
    (contacto || '').toString().trim(),
    '',
  ]);

  // Relación 1:1 — cada insumo de biblioteca nace con su registro activo
  const idAct = `ACT-${String(activos.length + 1).padStart(3, '0')}`;
  await appendRow(HOJA_ACTIVOS, [idAct, idBib, 0, '', 'Fresco', '', '', 'si']);

  return NextResponse.json({ success: true, id: idBib });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const { id, accion, datos, ingredientes } = await req.json();
  if (!id || !['editar', 'eliminar', 'ingredientes'].includes(accion)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const biblioteca = await getSheetData(HOJA_BIBLIOTECA, { crudo: true });
  const idx = biblioteca.findIndex((b) => b.ID_Biblioteca === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });
  }
  const fila = idx + 2; // +1 encabezado, +1 base 1
  const actual = biblioteca[idx];

  // ── Vínculo manual con los ingredientes de las recetas ──
  if (accion === 'ingredientes') {
    if (!Array.isArray(ingredientes)) {
      return NextResponse.json({ error: 'Lista inválida' }, { status: 400 });
    }
    await updateCell(
      HOJA_BIBLIOTECA,
      fila,
      await columnaIngredientes(),
      escribirIngredientes(ingredientes.map(String))
    );
    return NextResponse.json({ success: true });
  }

  if (accion === 'eliminar') {
    // Baja lógica: la fila se conserva para no romper recetas ni historial
    await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.eliminado, 'si');
    return NextResponse.json({ success: true });
  }

  // ── editar ──
  const nombreNuevo = (datos?.nombre || '').toString().trim();
  if (!nombreNuevo) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const equiv = parseFloat(datos?.equivalencia);
  if (isNaN(equiv) || equiv <= 0) {
    return NextResponse.json({ error: 'Equivalencia inválida' }, { status: 400 });
  }

  const claveNueva = normalizarNombre(nombreNuevo);
  if (biblioteca.some((b, k) => k !== idx && normalizarNombre(b.Nombre) === claveNueva)) {
    return NextResponse.json({ error: 'Ya existe otro insumo con ese nombre' }, { status: 400 });
  }

  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.nombre, nombreNuevo);
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.unidadCompra, (datos?.unidadCompra || '').toString().trim());
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.unidadReceta, (datos?.unidadReceta || '').toString().trim());
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.equivalencia, equiv);
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.categoria, (datos?.categoria || '').toString().trim().slice(0, 40));
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.proveedor, (datos?.proveedor || '').toString().trim());
  await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.contacto, (datos?.contacto || '').toString().trim());

  // Corregir un precio mal capturado sin tener que inventar una compra
  if (datos?.ultimoPrecioCompra !== undefined && datos.ultimoPrecioCompra !== '') {
    const precio = parseFloat(datos.ultimoPrecioCompra);
    if (isNaN(precio) || precio < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }
    await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.ultimoPrecio, precio);
  }

  // Cascada del nombre a las recetas (Ingrediente = columna C en Catalogo)
  const nombreViejo = (actual.Nombre || '').toString().trim();
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
