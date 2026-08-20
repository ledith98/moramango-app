/**
 * app/api/admin/presentaciones/route.ts
 *
 * Las formas en que se compra un insumo: marca, tamaño y precio.
 *
 * POST  → alta { idBiblioteca, marca, unidadCompra, contenido, proveedor? }
 * PATCH → edición { id, ...datos }
 *
 * No hay GET: las presentaciones viajan junto con los insumos, que es
 * donde se usan, y pedirlas aparte sería un viaje de más a Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { getSheetData } from '@/lib/googleSheets';
import { HOJA_BIBLIOTECA, HOJA_COMPRAS } from '@/lib/inventario';
import {
  borrarPresentacion,
  crearPresentacion,
  guardarPresentacion,
  leerPresentaciones,
} from '@/lib/presentaciones';
import { idDeProveedor } from '@/lib/proveedores';
import { getAdminSession } from '@/lib/roles';

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

/** El contenido es lo que hace comparable una presentación con otra. */
function revisarContenido(v: unknown): { ok: true; valor: number } | { ok: false; error: string } {
  const n = parseFloat((v ?? '').toString().replace(',', '.'));
  if (isNaN(n) || n <= 0) {
    return { ok: false, error: 'Escribe cuánto trae, en la unidad de las recetas' };
  }
  return { ok: true, valor: n };
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { idBiblioteca, marca, unidadCompra, contenido, proveedor, ultimoPrecio } =
    await req.json();

  if (!idBiblioteca) {
    return NextResponse.json({ error: 'Falta el insumo' }, { status: 400 });
  }
  const biblioteca = await getSheetData(HOJA_BIBLIOTECA, { crudo: true });
  const insumo = biblioteca.find((b) => b.ID_Biblioteca === idBiblioteca);
  if (!insumo) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });
  }

  const r = revisarContenido(contenido);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // El proveedor se resuelve contra el directorio, igual que en la compra
  const idProveedor = (proveedor ?? '').toString().trim()
    ? await idDeProveedor((proveedor ?? '').toString(), quienDe(sesion))
    : '';

  const precio = parseFloat((ultimoPrecio ?? '').toString().replace(',', '.'));

  const id = await crearPresentacion({
    idBiblioteca,
    marca: (marca ?? '').toString(),
    unidadCompra: (unidadCompra ?? '').toString(),
    contenido: r.valor,
    ultimoPrecio: !isNaN(precio) && precio > 0 ? precio : undefined,
    idProveedor,
  });

  await anotar(
    quienDe(sesion),
    'Insumos',
    `Agregó una presentación de ${insumo.Nombre}`,
    `${(marca ?? '').toString().trim() || 'sin marca'} · ${unidadCompra || 'paquete'} de ${r.valor} ${insumo.Unidad_Receta || ''}`.trim()
  );

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id, marca, unidadCompra, contenido, proveedor, ultimoPrecio, activa } = await req.json();
  if (!id) return NextResponse.json({ error: 'Falta la presentación' }, { status: 400 });

  const todas = await leerPresentaciones();
  const actual = todas.find((p) => p.id === id);
  if (!actual) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  const datos: Parameters<typeof guardarPresentacion>[1] = {};
  if (marca !== undefined) datos.marca = (marca ?? '').toString();
  if (unidadCompra !== undefined) datos.unidadCompra = (unidadCompra ?? '').toString();
  if (contenido !== undefined) {
    const r = revisarContenido(contenido);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    datos.contenido = r.valor;
  }
  if (ultimoPrecio !== undefined) {
    const n = parseFloat((ultimoPrecio ?? '').toString().replace(',', '.'));
    if (!isNaN(n) && n >= 0) datos.ultimoPrecio = n;
  }
  if (proveedor !== undefined) {
    datos.idProveedor = (proveedor ?? '').toString().trim()
      ? await idDeProveedor((proveedor ?? '').toString(), quienDe(sesion))
      : '';
  }
  if (activa !== undefined) datos.activa = !!activa;

  await guardarPresentacion(id, datos);
  await anotar(quienDe(sesion), 'Insumos', `Editó una presentación (${id})`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta la presentación' }, { status: 400 });

  const todas = await leerPresentaciones();
  const actual = todas.find((p) => p.id === id);
  if (!actual) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  /**
   * Con compras encima no se borra.
   *
   * Esas compras quedarían apuntando a la nada y se perdería su historial
   * de precios, que es lo que permite comparar proveedores. Para dejar de
   * usarla existe "ya no la compro así", que la esconde sin romper nada.
   */
  const compras = await getSheetData(HOJA_COMPRAS, { crudo: true }).catch(() => []);
  const cuantas = compras.filter((c) => (c.ID_Presentacion || '').toString().trim() === id).length;
  if (cuantas > 0) {
    return NextResponse.json(
      {
        error: `No se puede borrar: ya tiene ${cuantas} compra${cuantas === 1 ? '' : 's'} registrada${cuantas === 1 ? '' : 's'}. Usa "ya no la compro así" para dejar de verla, sin perder su historial de precios.`,
      },
      { status: 409 }
    );
  }

  await borrarPresentacion(id);
  await anotar(quienDe(sesion), 'Insumos', `Borró una presentación (${id})`, 'no tenía compras');
  return NextResponse.json({ success: true });
}
