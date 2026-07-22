/**
 * imagenes.ts
 *
 * Normaliza direcciones de imagen para que se puedan usar en un <img>.
 *
 * El caso típico: alguien copia el enlace de Google Drive tal como lo da
 * el botón Compartir. Ese enlace apunta a la PÁGINA del visor de Drive,
 * no al archivo, así que el navegador recibe HTML donde esperaba una
 * imagen y no muestra nada. Aquí se traduce al enlace directo.
 */

/** Extrae el id del archivo de cualquiera de las formas que usa Drive. */
function idDeDrive(url: string): string | null {
  const patrones = [
    /drive\.google\.com\/file\/d\/([\w-]{20,})/, // .../file/d/ID/view
    /drive\.google\.com\/open\?id=([\w-]{20,})/, // .../open?id=ID
    /drive\.google\.com\/uc\?[^]*\bid=([\w-]{20,})/, // .../uc?export=view&id=ID
    /docs\.google\.com\/uc\?[^]*\bid=([\w-]{20,})/,
  ];
  for (const p of patrones) {
    const m = p.exec(url);
    if (m) return m[1];
  }
  return null;
}

/**
 * Devuelve una URL que sirve para mostrar la imagen. Si no se reconoce el
 * formato, se regresa tal cual: puede ser un enlace directo válido.
 *
 * Ojo: aunque la dirección quede bien, Drive solo la entrega si el archivo
 * está compartido como "cualquier persona con el enlace".
 */
export function normalizarUrlImagen(url: string): string {
  const limpia = (url || '').trim();
  if (!limpia) return '';

  const id = idDeDrive(limpia);
  // lh3 sirve el archivo como imagen y admite hotlinking; el /uc? clásico
  // redirige y a veces devuelve una página de advertencia.
  if (id) return `https://lh3.googleusercontent.com/d/${id}`;

  // Dropbox entrega HTML con ?dl=0; ?raw=1 entrega el archivo
  if (/dropbox\.com/.test(limpia)) {
    return limpia.replace(/([?&])dl=0\b/, '$1raw=1');
  }

  return limpia;
}

/** true si la dirección viene del visor de Drive (no del archivo). */
export const esEnlaceDeVisorDrive = (url: string): boolean =>
  /drive\.google\.com\/(file\/d\/|open\?id=)/.test(url || '');
