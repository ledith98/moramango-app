/**
 * app/api/admin/recetario/route.ts
 *
 * Editor de recetas: qué insumo y cuánto lleva cada producto.
 *
 * GET    → productos con su receta ya resuelta (nombre, unidad y costo
 *          salen del insumo, no se guardan) + insumos disponibles
 * POST   → agrega un insumo a la receta de un producto
 * PATCH  → cambia la cantidad o la merma de un renglón
 * DELETE → quita un renglón de la receta
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, getSheetData, updateCell } from '@/lib/googleSheets';
import { factorMerma } from '@/lib/insumos';
import {
  costoPorUnidadReceta,
  HOJA_BIBLIOTECA,
  prepararInventario,
  redondear,
} from '@/lib/inventario';
import { COL_REC, HOJA_RECETARIO, prepararRecetario } from '@/lib/recetario';
import { getAdminSession } from '@/lib/roles';

const vivos = (filas: Record<string, string>[]) =>
  filas.filter((b) => (b.Eliminado || '').toLowerCase() !== 'si');

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await Promise.all([prepararInventario(), prepararRecetario()]);

  const [recetario, biblioteca, productos] = await Promise.all([
    getSheetData(HOJA_RECETARIO, { crudo: true }),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    getSheetData('Productos', { crudo: true }),
  ]);

  const bibPorId = new Map(vivos(biblioteca).map((b) => [b.ID_Biblioteca, b]));

  const lineasPorProducto = new Map<string, Record<string, string>[]>();
  for (const r of recetario) {
    if (!r.ID_Producto) continue;
    if (!lineasPorProducto.has(r.ID_Producto)) lineasPorProducto.set(r.ID_Producto, []);
    lineasPorProducto.get(r.ID_Producto)!.push(r);
  }

  const items = productos
    .filter((p) => p.ID_Producto && (p.Eliminado || '').toUpperCase() !== 'TRUE')
    .map((p) => {
      const lineas = (lineasPorProducto.get(p.ID_Producto) ?? []).map((r) => {
        const bib = bibPorId.get(r.ID_Biblioteca);
        const cantidad = parseFloat(r.Cantidad) || 0;
        const equivalencia = parseFloat(bib?.Equivalencia ?? '') || 1;
        const ultimoPrecio = parseFloat(bib?.Ultimo_Precio_Compra ?? '') || 0;
        const costoUnidad = costoPorUnidadReceta(ultimoPrecio, equivalencia);

        return {
          id: r.ID_Linea,
          idBiblioteca: r.ID_Biblioteca,
          // Nombre y unidad se resuelven al leer: renombrar un insumo
          // nunca rompe una receta, porque el vínculo es por ID
          insumo: bib?.Nombre ?? '(insumo eliminado)',
          unidad: bib?.Unidad_Receta ?? '',
          cantidad,
          merma: r.Merma_Pct || '',
          nota: r.Notas || '',
          // Costo real, calculado con la última compra registrada
          costo: costoUnidad !== null
            ? redondear(cantidad * factorMerma(r.Merma_Pct) * costoUnidad, 2)
            : null,
          huerfano: !bib,
        };
      });

      const conCosto = lineas.filter((l) => l.costo !== null);
      return {
        id: p.ID_Producto,
        nombre: p.Nombre || '',
        categoria: p['Categoría'] || p.Categoria || '',
        precio: parseFloat(p.Precio_Venta) || 0,
        emoji: (p.Emoji || '').trim(),
        lineas,
        // Solo se muestra si TODOS los insumos tienen precio; un costo
        // a medias engaña más de lo que ayuda
        costoTotal:
          lineas.length > 0 && conCosto.length === lineas.length
            ? redondear(conCosto.reduce((s, l) => s + (l.costo ?? 0), 0), 2)
            : null,
      };
    });

  const insumos = vivos(biblioteca).map((b) => ({
    id: b.ID_Biblioteca,
    nombre: b.Nombre || '',
    unidad: b.Unidad_Receta || '',
    categoria: b.Categoria || '',
    tienePrecio: (parseFloat(b.Ultimo_Precio_Compra) || 0) > 0,
  }));

  return NextResponse.json({ items, insumos });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const { idProducto, idBiblioteca, cantidad } = await req.json();
  if (!idProducto || !idBiblioteca) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }
  const cant = parseFloat(cantidad);
  if (isNaN(cant) || cant <= 0) {
    return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
  }

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });

  // Un insumo repetido en la misma receta partiría el consumo en dos
  if (recetario.some((r) => r.ID_Producto === idProducto && r.ID_Biblioteca === idBiblioteca)) {
    return NextResponse.json(
      { error: 'Ese insumo ya está en la receta. Edita su cantidad.' },
      { status: 400 }
    );
  }

  const idLinea = `REC-${String(recetario.length + 1).padStart(4, '0')}`;
  await appendRow(HOJA_RECETARIO, [idLinea, idProducto, idBiblioteca, cant, '', '']);

  return NextResponse.json({ success: true, id: idLinea });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const { id, cantidad, merma } = await req.json();
  if (!id) return NextResponse.json({ error: 'Falta el renglón' }, { status: 400 });

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });
  const idx = recetario.findIndex((r) => r.ID_Linea === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Renglón no encontrado' }, { status: 404 });
  }
  const fila = idx + 2;

  if (cantidad !== undefined) {
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    }
    await updateCell(HOJA_RECETARIO, fila, COL_REC.cantidad, cant);
    // Al corregir la cantidad, el aviso de la migración ya no aplica
    await updateCell(HOJA_RECETARIO, fila, COL_REC.notas, '');
  }
  if (merma !== undefined) {
    await updateCell(HOJA_RECETARIO, fila, COL_REC.merma, (merma || '').toString().trim());
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el renglón' }, { status: 400 });

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });
  const idx = recetario.findIndex((r) => r.ID_Linea === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Renglón no encontrado' }, { status: 404 });
  }

  // Se vacía la fila en vez de borrarla: eliminar filas recorrería todas
  // las de abajo y los índices que ya se leyeron dejarían de servir.
  const fila = idx + 2;
  await updateCell(HOJA_RECETARIO, fila, COL_REC.idProducto, '');
  await updateCell(HOJA_RECETARIO, fila, COL_REC.idBiblioteca, '');
  await updateCell(HOJA_RECETARIO, fila, COL_REC.cantidad, '');
  await updateCell(HOJA_RECETARIO, fila, COL_REC.notas, 'eliminado');

  return NextResponse.json({ success: true });
}
