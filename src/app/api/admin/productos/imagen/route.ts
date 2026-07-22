/**
 * app/api/admin/productos/imagen/route.ts
 *
 * Sube la foto de un producto a Vercel Blob y guarda su URL en la
 * columna Imagen_URL de la hoja Productos. La tienda ya prefiere la foto
 * sobre el emoji, así que con guardar la URL basta.
 *
 * POST   multipart/form-data { idProducto, archivo }
 * DELETE ?id=PROD-001  → quita la foto y vuelve al emoji
 *
 * Requiere BLOB_READ_WRITE_TOKEN. Si no está configurado responde 503 con
 * un mensaje claro, y el panel ofrece pegar una URL a mano como respaldo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { del, put } from '@vercel/blob';
import { ensureColumn, findRow, updateCell } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

const TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

const almacenamientoListo = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const noConfigurado = () =>
  NextResponse.json(
    {
      error:
        'Falta activar el almacenamiento de imágenes. Mientras tanto puedes pegar la URL de la foto.',
      codigo: 'SIN_ALMACENAMIENTO',
    },
    { status: 503 }
  );

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!almacenamientoListo()) return noConfigurado();

  const form = await req.formData();
  const idProducto = form.get('idProducto');
  const archivo = form.get('archivo');

  if (typeof idProducto !== 'string' || !idProducto) {
    return NextResponse.json({ error: 'Falta el producto' }, { status: 400 });
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
  }
  if (!TIPOS.includes(archivo.type)) {
    return NextResponse.json(
      { error: 'Solo se aceptan imágenes PNG, JPG o WEBP' },
      { status: 400 }
    );
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'La imagen pesa más de 4 MB. Tómala en menor calidad o recórtala.' },
      { status: 400 }
    );
  }

  const fila = await findRow('Productos', 'ID_Producto', idProducto);
  if (!fila) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const extension = archivo.type.split('/')[1].replace('jpeg', 'jpg');
  const { url } = await put(`productos/${idProducto}.${extension}`, archivo, {
    access: 'public',
    // Cada subida estrena URL: si no, la foto vieja se queda en caché
    addRandomSuffix: true,
    contentType: archivo.type,
  });

  const anterior = fila.data.Imagen_URL || '';
  const colImagen = await ensureColumn('Productos', 'Imagen_URL');
  await updateCell('Productos', fila.rowIndex, colImagen, url);

  // La foto anterior ya no le sirve a nadie: se borra para no acumular
  if (anterior.includes('.blob.vercel-storage.com')) {
    await del(anterior).catch(() => {});
  }

  return NextResponse.json({ success: true, url });
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const idProducto = new URL(req.url).searchParams.get('id');
  if (!idProducto) {
    return NextResponse.json({ error: 'Falta el producto' }, { status: 400 });
  }

  const fila = await findRow('Productos', 'ID_Producto', idProducto);
  if (!fila) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
  }

  const anterior = fila.data.Imagen_URL || '';
  const colImagen = await ensureColumn('Productos', 'Imagen_URL');
  await updateCell('Productos', fila.rowIndex, colImagen, '');

  if (anterior.includes('.blob.vercel-storage.com') && almacenamientoListo()) {
    await del(anterior).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
