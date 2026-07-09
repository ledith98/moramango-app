/**
 * app/api/admin/productos/route.ts
 *
 * GET    → Todos los productos (admin ve disponibles y no disponibles,
 *          excluye los marcados como Eliminado)
 * POST   → Crea un producto nuevo
 * PATCH  → Edita nombre/categoría/descripción/precio y/o Disponible
 * DELETE → Borrado suave: marca Eliminado='TRUE' y Disponible='FALSE'
 *          (no borra la fila del Sheet)
 *
 * Orden de columnas en Productos:
 * A: ID_Producto  B: Nombre  C: Categoría  D: Descripcion
 * E: Precio_Venta  F: Costo_Produccion  G: Disponible  H: Imagen_URL
 * I: Orden_Menu  J: Margen_Deseado  K: Precio_Sugerido
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, ensureColumn, findRow, getSheetData, updateCell } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const productos = await getSheetData('Productos');
  const visibles = productos.filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE');
  return NextResponse.json({ productos: visibles });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, categoria, descripcion, precio } = await req.json();

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const precioNum = parseFloat(precio);
  if (isNaN(precioNum) || precioNum < 0) {
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
  }

  const existentes = await getSheetData('Productos');
  const nuevoId = `PROD-${String(existentes.length + 1).padStart(3, '0')}`;
  const ordenMenu = existentes.length + 1;

  await appendRow('Productos', [
    nuevoId,
    nombre.trim(),
    categoria?.trim() || 'Otros',
    descripcion?.trim() || '',
    precioNum,
    0,
    'TRUE',
    '',
    ordenMenu,
    '',
    '',
  ]);

  return NextResponse.json({ success: true, idProducto: nuevoId });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idProducto, nombre, categoria, descripcion, precio, disponible } = await req.json();

  if (!idProducto) {
    return NextResponse.json({ error: 'Falta idProducto' }, { status: 400 });
  }

  const fila = await findRow('Productos', 'ID_Producto', idProducto);
  if (!fila) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  if (typeof nombre === 'string' && nombre.trim()) {
    await updateCell('Productos', fila.rowIndex, 2, nombre.trim());
  }
  if (typeof categoria === 'string' && categoria.trim()) {
    await updateCell('Productos', fila.rowIndex, 3, categoria.trim());
  }
  if (typeof descripcion === 'string') {
    await updateCell('Productos', fila.rowIndex, 4, descripcion.trim());
  }
  if (precio !== undefined) {
    const precioNum = parseFloat(precio);
    if (isNaN(precioNum) || precioNum < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }
    await updateCell('Productos', fila.rowIndex, 5, precioNum);
  }
  if (typeof disponible === 'boolean') {
    await updateCell('Productos', fila.rowIndex, 7, disponible ? 'TRUE' : 'FALSE');
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const idProducto = searchParams.get('id');

  if (!idProducto) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  }

  const fila = await findRow('Productos', 'ID_Producto', idProducto);
  if (!fila) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const colEliminado = await ensureColumn('Productos', 'Eliminado');
  await updateCell('Productos', fila.rowIndex, colEliminado, 'TRUE');
  await updateCell('Productos', fila.rowIndex, 7, 'FALSE');

  return NextResponse.json({ success: true });
}
