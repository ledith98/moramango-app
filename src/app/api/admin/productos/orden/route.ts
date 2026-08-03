/**
 * app/api/admin/productos/orden/route.ts
 *
 * POST → { ids: string[] } Reacomoda el menú.
 *
 * Recibe TODOS los productos en el orden en que deben quedar y reescribe
 * Orden_Menu como 1, 2, 3… en vez de intercambiar valores sueltos.
 *
 * Se hace así porque los números venían desparejos entre sí (10, 31, 35,
 * 170, 285…): intercambiar dos valores conserva ese desorden y a la larga
 * dos productos acaban con el mismo número, que es cuando el menú empieza
 * a bailar solo. Renumerar de corrido deja la lista siempre limpia.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData, updateCeldas } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

/** Columna I de la hoja Productos */
const COL_ORDEN = 9;

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Falta el orden de los productos' }, { status: 400 });
  }

  const productos = await getSheetData('Productos');
  // rowIndex: +1 por el encabezado, +1 porque las filas empiezan en 1
  const filaPorId = new Map(productos.map((p, i) => [p.ID_Producto, i + 2]));

  const cambios: { fila: number; col: number; valor: number }[] = [];
  const vistos = new Set<string>();
  let posicion = 0;

  for (const id of ids) {
    const fila = filaPorId.get((id ?? '').toString());
    // Un id que ya no existe se ignora en vez de romper todo el reacomodo:
    // pudo borrarse desde otra pestaña mientras se movían las flechas.
    if (!fila || vistos.has(id)) continue;
    vistos.add(id);
    posicion += 1;
    cambios.push({ fila, col: COL_ORDEN, valor: posicion });
  }

  if (cambios.length === 0) {
    return NextResponse.json({ error: 'Ninguno de esos productos existe' }, { status: 400 });
  }

  // Un solo viaje a Google para los 28 productos
  await updateCeldas('Productos', cambios);

  return NextResponse.json({ success: true, acomodados: cambios.length });
}
