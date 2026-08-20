/**
 * app/api/admin/productos/imagen/migrar/route.ts
 *
 * Trae a la app las fotos que hoy viven en Google Drive.
 *
 * Las 30 fotos de los productos están alojadas en Drive. Funcionan, pero
 * no son nuestras: si al archivo le cambian el permiso, si se mueve de
 * carpeta o si Google decide limitar cuántas veces se puede mostrar desde
 * fuera, la tienda se queda sin fotos y nadie se entera hasta que un
 * cliente lo ve. Copiarlas al almacén de la app quita esa dependencia.
 *
 * GET  → cuántas faltan por traer
 * POST → trae unas cuantas y dice cuántas quedan
 *
 * Va de poquitas en poquitas a propósito: bajar y volver a subir treinta
 * fotos no cabe en el tiempo que Vercel le da a una llamada, así que el
 * panel llama varias veces y va mostrando el avance.
 */

import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { ensureColumn, getSheetData, updateCell } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';

/** Cuántas por llamada. Bajar y subir una foto tarda ~2 s. */
const POR_TANDA = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const yaEstaEnLaApp = (url: string) => url.includes('.blob.vercel-storage.com');

/**
 * Las fotos que faltan, con la fila donde vive cada una.
 *
 * Se lee la hoja completa una sola vez: pedirla por producto gastaría la
 * cuota de Google en un abrir y cerrar de ojos.
 */
async function pendientes() {
  const filas = await getSheetData('Productos', { crudo: true });
  return filas
    .map((f, i) => ({
      id: (f.ID_Producto || '').toString().trim(),
      nombre: (f.Nombre || '').toString().trim(),
      url: (f.Imagen_URL || '').toString().trim(),
      // +2: la primera fila son los encabezados y las filas cuentan desde 1
      fila: i + 2,
    }))
    .filter((p) => p.id && p.url && !yaEstaEnLaApp(p.url));
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ listo: false, pendientes: 0 });
  }
  const faltan = await pendientes();
  return NextResponse.json({ listo: true, pendientes: faltan.length });
}

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Falta activar el almacenamiento de imágenes en Vercel.' },
      { status: 503 }
    );
  }
  const faltan = await pendientes();
  const tanda = faltan.slice(0, POR_TANDA);
  const colImagen = await ensureColumn('Productos', 'Imagen_URL');

  /**
   * Varios productos comparten la misma foto —los cuatro jugos usan una
   * sola—, así que la misma dirección se sube una vez y se reparte. Sin
   * esto se subiría cuatro veces el mismo archivo.
   */
  const yaSubidas = new Map<string, string>();
  const errores: string[] = [];
  let migradas = 0;

  for (const p of tanda) {
    try {
      let nueva = yaSubidas.get(p.url);

      if (!nueva) {
        /**
         * A Drive se le puede pedir la foto ya redimensionada: basta con
         * "=w1200" al final. Sale más ligera sin perder nitidez para el
         * tamaño en que la tienda la muestra, y nos ahorra tener que
         * comprimirla aquí.
         */
        const origen = p.url.includes('lh3.googleusercontent.com')
          ? `${p.url.split('=')[0]}=w1200`
          : p.url;

        const res = await fetch(origen);
        if (!res.ok) throw new Error(`no se pudo bajar (${res.status})`);

        const tipo = (res.headers.get('content-type') || '').split(';')[0].trim();
        if (!TIPOS.includes(tipo)) {
          // Drive devuelve HTML cuando el archivo no es público: es el
          // error más común y hay que decirlo con esas palabras.
          throw new Error(
            tipo.includes('html')
              ? 'el archivo no está compartido como “cualquier persona con el enlace”'
              : `no es una imagen (${tipo || 'sin tipo'})`
          );
        }

        const datos = await res.arrayBuffer();
        if (datos.byteLength > MAX_BYTES) throw new Error('pesa demasiado');

        const extension = tipo.split('/')[1].replace('jpeg', 'jpg');
        const subida = await put(`productos/${p.id}.${extension}`, datos, {
          access: 'public',
          addRandomSuffix: true,
          contentType: tipo,
        });
        nueva = subida.url;
        yaSubidas.set(p.url, nueva);
      }

      await updateCell('Productos', p.fila, colImagen, nueva);
      migradas++;
    } catch (e) {
      // La foto original NO se toca: si algo sale mal, el producto se
      // queda con la de Drive y se puede reintentar.
      errores.push(`${p.nombre}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    migradas,
    // Las que fallaron siguen contando como pendientes: no se movieron.
    // El panel corta cuando una tanda no logra ninguna, para no reintentar
    // en círculos las mismas fotos rotas.
    pendientes: faltan.length - migradas,
    atoradas: errores.length,
    errores,
  });
}
