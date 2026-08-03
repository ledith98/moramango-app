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
import { normalizarUrlImagen } from '@/lib/imagenes';
import { getAdminSession } from '@/lib/roles';
import { iguales, serializarTamanos, type Tamano } from '@/lib/tamanos';
import { type GrupoOpcion, serializarOpciones } from '@/lib/opciones';
import { type Extra, serializarExtras } from '@/lib/extras';

/**
 * Deja como mucho dos emojis. Los combos llevan dos (🥪🥤) y más de eso ya
 * no se lee en la tarjeta del producto.
 */
function recortarEmoji(valor: string): string {
  return [...valor.trim()].filter((c) => c.trim()).slice(0, 4).join('');
}

/**
 * Revisa y normaliza los tamaños. Se exporta para poder probarla sin
 * levantar la ruta, que exige sesión de administrador.
 *
 * Se comparte entre crear y editar: si
 * solo se validara al editar, un producto nuevo podría nacer con precios
 * inválidos y nadie se enteraría hasta que un cliente lo pidiera.
 */
export function revisarTamanos(tamanos: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  if (!Array.isArray(tamanos)) return { ok: false, error: 'Tamaños inválidos' };
  const limpios: Tamano[] = [];
  for (const t of tamanos as { nombre?: string; precio?: unknown }[]) {
    const nom = (t?.nombre ?? '').toString().trim();
    const p = parseFloat((t?.precio ?? '').toString().replace(',', '.'));
    if (!nom) continue;
    if (isNaN(p) || p < 0) return { ok: false, error: `Precio inválido en el tamaño "${nom}"` };
    if (limpios.some((x) => iguales(x.nombre, nom))) {
      return { ok: false, error: `El tamaño "${nom}" está repetido` };
    }
    limpios.push({ nombre: nom, precio: p });
  }
  // Un solo tamaño confunde más de lo que ayuda: o hay opciones o no hay
  if (limpios.length === 1) {
    return { ok: false, error: 'Deja al menos dos tamaños, o quítalos todos' };
  }
  return { ok: true, valor: serializarTamanos(limpios) };
}

/** Igual que revisarTamanos, para las preguntas al cliente. */
export function revisarOpciones(opciones: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  if (!Array.isArray(opciones)) return { ok: false, error: 'Opciones inválidas' };
  const limpios: GrupoOpcion[] = [];
  for (const g of opciones as { nombre?: string; opciones?: unknown }[]) {
    const nom = (g?.nombre ?? '').toString().trim();
    if (!nom) continue;
    const lista = Array.isArray(g?.opciones)
      ? (g.opciones as unknown[]).map((o) => (o ?? '').toString().trim()).filter(Boolean)
      : [];
    if (lista.length < 2) {
      return { ok: false, error: `"${nom}" necesita al menos dos opciones para poder elegir` };
    }
    if (limpios.some((x) => x.nombre.toLowerCase() === nom.toLowerCase())) {
      return { ok: false, error: `El grupo "${nom}" está repetido` };
    }
    limpios.push({ nombre: nom, opciones: lista });
  }
  return { ok: true, valor: serializarOpciones(limpios) };
}

/**
 * Toppings: mismo formato que los tamaños, pero aquí un solo extra sí
 * tiene sentido —se puede ofrecer únicamente chía— y el precio puede ser
 * 0 si la casa lo regala.
 */
export function revisarExtras(extras: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  if (!Array.isArray(extras)) return { ok: false, error: 'Extras inválidos' };
  const limpios: Extra[] = [];
  for (const e of extras as { nombre?: string; precio?: unknown }[]) {
    const nom = (e?.nombre ?? '').toString().trim();
    const p = parseFloat((e?.precio ?? '').toString().replace(',', '.'));
    if (!nom) continue;
    if (isNaN(p) || p < 0) return { ok: false, error: `Precio inválido en el extra "${nom}"` };
    if (limpios.some((x) => iguales(x.nombre, nom))) {
      return { ok: false, error: `El extra "${nom}" está repetido` };
    }
    limpios.push({ nombre: nom, precio: p });
  }
  return { ok: true, valor: serializarExtras(limpios) };
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  await Promise.all([
    ensureColumn('Productos', 'Emoji'),
    ensureColumn('Productos', 'Tamanos'),
    ensureColumn('Productos', 'Opciones'),
    ensureColumn('Productos', 'Extras'),
  ]);
  // crudo: la hoja tiene locale es_ES y devolvía el precio como "50,00",
  // que un <input type="number"> no puede mostrar y deja el campo vacío
  const productos = await getSheetData('Productos', { crudo: true });
  const visibles = productos.filter((p) => (p.Eliminado || '').toUpperCase() !== 'TRUE');
  return NextResponse.json({ productos: visibles });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { nombre, categoria, descripcion, precio, emoji, existencias, tamanos, opciones, extras } =
    await req.json();

  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const precioNum = parseFloat(precio);
  if (isNaN(precioNum) || precioNum < 0) {
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
  }

  let tamanosValor: string | null = null;
  if (tamanos !== undefined) {
    const r = revisarTamanos(tamanos);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    tamanosValor = r.valor;
  }
  let opcionesValor: string | null = null;
  if (opciones !== undefined) {
    const r = revisarOpciones(opciones);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    opcionesValor = r.valor;
  }
  let extrasValor: string | null = null;
  if (extras !== undefined) {
    const r = revisarExtras(extras);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    extrasValor = r.valor;
  }
  let existenciasLimpias: string | number | null = null;
  if (existencias !== undefined) {
    const txt = (existencias ?? '').toString().trim();
    if (txt === '') {
      existenciasLimpias = '';
    } else {
      const n = parseInt(txt, 10);
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Existencias inválidas' }, { status: 400 });
      }
      existenciasLimpias = n;
    }
  }

  const existentes = await getSheetData('Productos');
  const nuevoId = `PROD-${String(existentes.length + 1).padStart(3, '0')}`;

  // El producto nuevo entra al final de SU grupo, no al final del menú.
  // Antes se le daba un número más alto que todos, así que un jugo nuevo
  // aparecía después de las bebidas, fuera de los suyos, y había que
  // reacomodarlo a mano cada vez.
  const cat = (categoria?.trim() || 'Otros').toLowerCase();
  const ordenesDelGrupo = existentes
    .filter((p) => (p['Categoría'] ?? p.Categoria ?? '').toString().trim().toLowerCase() === cat)
    .map((p) => parseInt(p.Orden_Menu))
    .filter((n) => !isNaN(n));
  const ordenMenu =
    ordenesDelGrupo.length > 0
      ? Math.max(...ordenesDelGrupo) + 1
      : existentes.length + 1; // categoría nueva: se va al final y se acomoda desde el panel

  const fila = await appendRow('Productos', [
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

  // Estas columnas van fuera del rango A–K que escribe appendRow, así que
  // se llenan aparte. Se validan ANTES de crear la fila para no dejar un
  // producto a medias si algo viene mal.
  if (typeof emoji === 'string' && emoji.trim()) {
    const colEmoji = await ensureColumn('Productos', 'Emoji');
    await updateCell('Productos', fila, colEmoji, recortarEmoji(emoji));
  }
  if (existenciasLimpias !== null) {
    const col = await ensureColumn('Productos', 'Existencias');
    await updateCell('Productos', fila, col, existenciasLimpias);
  }
  if (tamanosValor !== null) {
    const col = await ensureColumn('Productos', 'Tamanos');
    await updateCell('Productos', fila, col, tamanosValor);
  }
  if (opcionesValor !== null) {
    const col = await ensureColumn('Productos', 'Opciones');
    await updateCell('Productos', fila, col, opcionesValor);
  }
  if (extrasValor !== null) {
    const col = await ensureColumn('Productos', 'Extras');
    await updateCell('Productos', fila, col, extrasValor);
  }

  return NextResponse.json({ success: true, idProducto: nuevoId });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const {
    idProducto,
    nombre,
    categoria,
    descripcion,
    precio,
    disponible,
    oculto,
    emoji,
    imagenUrl,
    existencias,
    tamanos,
    opciones,
    extras,
  } = await req.json();

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
  // Oculto es independiente de Disponible: uno saca el producto del menú,
  // el otro solo frena la venta dejándolo a la vista
  if (typeof oculto === 'boolean') {
    const colOculto = await ensureColumn('Productos', 'Oculto');
    await updateCell('Productos', fila.rowIndex, colOculto, oculto ? 'TRUE' : '');
  }
  if (typeof emoji === 'string') {
    // Columna resuelta por nombre: se crea sola la primera vez
    const colEmoji = await ensureColumn('Productos', 'Emoji');
    await updateCell('Productos', fila.rowIndex, colEmoji, recortarEmoji(emoji));
  }
  // Respaldo para cuando la foto vive fuera (Drive, Imgur…) en vez de subirse
  if (typeof imagenUrl === 'string') {
    const limpia = imagenUrl.trim();
    if (limpia && !/^https:\/\//i.test(limpia)) {
      return NextResponse.json(
        { error: 'La dirección de la imagen debe empezar con https://' },
        { status: 400 }
      );
    }
    // Un enlace de Drive copiado del botón Compartir apunta al visor, no
    // al archivo: se traduce para que el <img> reciba la imagen
    const colImagen = await ensureColumn('Productos', 'Imagen_URL');
    await updateCell('Productos', fila.rowIndex, colImagen, normalizarUrlImagen(limpia));
  }
  // Existencias: solo para productos de reventa (conchas, galletas…). Vacío
  // = sin control, no muestra "últimas piezas" ni se descuenta.
  if (existencias !== undefined) {
    const colExistencias = await ensureColumn('Productos', 'Existencias');
    const limpio = (existencias ?? '').toString().trim();
    if (limpio === '') {
      await updateCell('Productos', fila.rowIndex, colExistencias, '');
    } else {
      const n = parseInt(limpio, 10);
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: 'Existencias inválidas' }, { status: 400 });
      }
      await updateCell('Productos', fila.rowIndex, colExistencias, n);
    }
  }
  // Tamaños con precio propio (500 ml / 1 litro). Lista vacía = el producto
  // vuelve a venderse con un solo precio, el de siempre.
  if (tamanos !== undefined) {
    const r = revisarTamanos(tamanos);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const col = await ensureColumn('Productos', 'Tamanos');
    await updateCell('Productos', fila.rowIndex, col, r.valor);
  }
  // Opciones a elegir dentro del producto (queso del combo, sabor de la
  // bebida…). Lista vacía = el producto vuelve a venderse sin preguntar.
  if (opciones !== undefined) {
    const r = revisarOpciones(opciones);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const col = await ensureColumn('Productos', 'Opciones');
    await updateCell('Productos', fila.rowIndex, col, r.valor);
  }

  // Toppings con costo. Lista vacía = el producto deja de ofrecerlos.
  if (extras !== undefined) {
    const r = revisarExtras(extras);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const col = await ensureColumn('Productos', 'Extras');
    await updateCell('Productos', fila.rowIndex, col, r.valor);
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
