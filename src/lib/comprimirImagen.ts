/**
 * comprimirImagen.ts
 *
 * Achica la foto EN EL TELÉFONO, antes de subirla.
 *
 * Sin esto hay dos problemas, los dos del lado de quien usa la app:
 *
 *   1. Una foto de celular pesa entre 2 y 5 MB. El servidor rechaza todo
 *      lo que pase de 4 MB, así que la mitad de las fotos ni siquiera
 *      suben — y el mensaje "recórtala" no le dice a nadie cómo hacerlo.
 *   2. La que sí sube se le manda TAL CUAL al cliente que abre la tienda
 *      con datos móviles. Cuatro megas por producto en una lista de
 *      cuarenta productos es una tienda que no carga.
 *
 * Aquí la foto se redibuja a 1200 px de lado y se guarda como WebP. Una
 * foto de 4 MB queda en unos 150 KB, y a 1200 px se sigue viendo nítida
 * en cualquier teléfono: en la tienda se muestra a 96 px y en el detalle
 * a menos de 400.
 *
 * Es un módulo de navegador: usa canvas y no corre en el servidor.
 */

/** Lo más ancho o alto que necesita la foto para verse bien en la tienda. */
const LADO_MAXIMO = 1200;
const CALIDAD = 0.82;

export interface FotoLista {
  archivo: File;
  /** Bytes originales, para poder decir cuánto se ahorró */
  antes: number;
  despues: number;
}

/**
 * Devuelve la foto lista para subir.
 *
 * Si algo falla —un formato que el navegador no sabe dibujar, un canvas
 * bloqueado— regresa la original sin tocar: es preferible intentar subir
 * la grande a dejar a alguien sin poder poner su foto.
 */
export async function comprimirImagen(original: File): Promise<FotoLista> {
  const sinTocar: FotoLista = { archivo: original, antes: original.size, despues: original.size };

  try {
    // from-image respeta la orientación de la cámara; sin esto las fotos
    // tomadas en vertical salen acostadas.
    const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return sinTocar;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    // WebP pesa bastante menos que JPG a la misma vista. Si el navegador
    // no lo soporta, toBlob devuelve PNG y el peso sube: por eso abajo se
    // compara y se queda con lo más ligero.
    const trozo = await new Promise<Blob | null>((listo) =>
      lienzo.toBlob(listo, 'image/webp', CALIDAD)
    );
    if (!trozo || trozo.size >= original.size) return sinTocar;

    const tipo = trozo.type || 'image/webp';
    const extension = tipo.split('/')[1].replace('jpeg', 'jpg');
    const nombre = original.name.replace(/\.[^.]+$/, '') || 'foto';

    return {
      archivo: new File([trozo], `${nombre}.${extension}`, { type: tipo }),
      antes: original.size,
      despues: trozo.size,
    };
  } catch {
    return sinTocar;
  }
}

/** "3.2 MB" — para poder decirle a quien sube qué pasó con su foto. */
export const enMegas = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
