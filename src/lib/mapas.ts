/**
 * mapas.ts
 *
 * Cómo llegar a un lugar, a partir de lo que se haya escrito.
 *
 * La dirección de un proveedor se captura de dos formas según lo que
 * tenga a la mano: pegando el enlace que comparte Google Maps, o
 * escribiendo la dirección tal cual. Obligar a una sola haría que se
 * dejara vacía la mitad de las veces, así que se aceptan las dos y aquí
 * se decide qué hacer con cada una.
 */

/** Dominios de los que Google Maps entiende un enlace ya armado. */
const DOMINIOS_MAPA = [
  'google.com/maps',
  'maps.google.',
  'maps.app.goo.gl',
  'goo.gl/maps',
];

export const esEnlaceDeMapa = (texto: string): boolean => {
  const t = (texto ?? '').trim().toLowerCase();
  if (!t.startsWith('http://') && !t.startsWith('https://')) return false;
  return DOMINIOS_MAPA.some((d) => t.includes(d));
};

/**
 * A dónde mandar a quien toque "Cómo llegar".
 *
 * Un enlace pegado se abre tal cual: ya trae el punto exacto que alguien
 * marcó, y buscar su texto en Maps daría un lugar distinto. Una dirección
 * escrita se busca, que es lo que haría cualquiera a mano.
 *
 * Devuelve '' cuando no hay nada: quien llama decide no mostrar el botón,
 * en vez de ofrecer uno que abre Maps en la nada.
 */
export function enlaceMapa(direccion: string): string {
  const t = (direccion ?? '').trim();
  if (!t) return '';
  if (esEnlaceDeMapa(t)) return t;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t)}`;
}

/** Texto corto para el botón, según lo que se haya guardado. */
export const etiquetaMapa = (direccion: string): string =>
  esEnlaceDeMapa(direccion) ? 'Ver ubicación' : 'Cómo llegar';
