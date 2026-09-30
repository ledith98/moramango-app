/**
 * enlaces.ts
 *
 * Partir un texto en lo que es liga y lo que no.
 *
 * Las notas de un insumo terminan trayendo direcciones: dónde se pide el
 * papel encerado, la página de Sam's con esa presentación exacta. Escritas
 * como texto plano no sirven de mucho — hay que seleccionarlas y copiarlas
 * desde el celular, con el dedo, dentro de una tarjeta chica.
 *
 * Aquí solo se decide QUÉ es liga; pintarla es cosa de la pantalla. Se
 * aceptan nada más http y https: un `javascript:` en una nota sería un
 * botón para ejecutar código dentro del panel, y una nota es un
 * recordatorio, no un programa.
 *
 * Módulo puro, sin googleSheets, para que lo pueda usar cualquier
 * pantalla 'use client'.
 */

export interface Tramo {
  texto: string;
  /** Vacío = texto normal. Con algo = píntalo como liga a esa dirección. */
  liga: string;
}

const DIRECCION = /https?:\/\/[^\s<>"']+/gi;

/**
 * Los signos que suelen ir DESPUÉS de una liga, no dentro.
 *
 * "mira https://sams.com.mx/mostaza." termina en punto por la oración,
 * no por la dirección. El paréntesis solo se recorta si no está
 * emparejado, porque hay direcciones que sí lo traen dentro.
 */
function recortarFinal(url: string): string {
  let fin = url;
  while (fin.length > 0) {
    const ultimo = fin[fin.length - 1];
    if ('.,;:!?'.includes(ultimo)) {
      fin = fin.slice(0, -1);
      continue;
    }
    if (ultimo === ')' && !fin.includes('(')) {
      fin = fin.slice(0, -1);
      continue;
    }
    break;
  }
  return fin;
}

/**
 * El texto partido en tramos, en orden, listo para pintar.
 *
 * Un texto sin ninguna liga devuelve un solo tramo, que es lo que
 * permite usar esto siempre sin preguntar antes si trae direcciones.
 */
export function partirEnlaces(texto: string): Tramo[] {
  const t = (texto ?? '').toString();
  if (!t) return [];

  const tramos: Tramo[] = [];
  let desde = 0;
  for (const encontrada of t.matchAll(DIRECCION)) {
    const inicio = encontrada.index ?? 0;
    const url = recortarFinal(encontrada[0]);
    // Se quedó sin nada tras recortar: no era una dirección
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    if (inicio > desde) tramos.push({ texto: t.slice(desde, inicio), liga: '' });
    tramos.push({ texto: url, liga: url });
    desde = inicio + url.length;
  }
  if (desde < t.length) tramos.push({ texto: t.slice(desde), liga: '' });
  return tramos;
}

/** Cómo se lee una liga larga en una tarjeta angosta: "sams.com.mx" */
export function nombreCorto(liga: string): string {
  try {
    const u = new URL(liga);
    return u.hostname.replace(/^www\./i, '') + (u.pathname !== '/' ? '…' : '');
  } catch {
    return liga;
  }
}
