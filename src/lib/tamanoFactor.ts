/**
 * tamanoFactor.ts
 *
 * Cuánto insumo se lleva un tamaño respecto al más chico.
 *
 * Un jugo de 1 litro gasta el doble de fruta que uno de 500 ml, pero el
 * descuento de inventario contaba las dos ventas igual. Mientras casi
 * ninguna receta estaba ligada no se notaba; conforme se vinculan, el
 * stock se va desviando sin que nadie sepa por qué.
 *
 * El factor sale del NOMBRE del tamaño ("500 ml", "1 litro"). No es
 * elegante, pero evita pedirle a la dueña que capture un número más por
 * cada tamaño de cada producto. Si el nombre no dice una medida —"Chico",
 * "Grande"— el factor es 1 y todo queda como está hoy: es preferible no
 * descontar de más que inventarse una proporción.
 */

import type { Tamano } from './tamanos';

/** Todo se lleva a mililitros o gramos, que para líquidos de cocina da igual. */
const EQUIVALENCIAS: Record<string, number> = {
  ml: 1,
  mls: 1,
  mililitro: 1,
  mililitros: 1,
  l: 1000,
  lt: 1000,
  lts: 1000,
  litro: 1000,
  litros: 1000,
  g: 1,
  gr: 1,
  gramo: 1,
  gramos: 1,
  kg: 1000,
  kilo: 1000,
  kilos: 1000,
  oz: 29.57,
  onza: 29.57,
  onzas: 29.57,
};

/**
 * "1 litro" → 1000. Devuelve null si el nombre no trae una medida
 * reconocible, que es la señal de "no puedo saberlo, no lo inventes".
 */
export function medidaDe(nombre: string): number | null {
  const texto = (nombre || '').trim().toLowerCase().replace(',', '.');
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-zá-ú]+)/i.exec(texto);
  if (!m) return null;
  const cantidad = parseFloat(m[1]);
  const unidad = EQUIVALENCIAS[m[2]];
  if (!unidad || !isFinite(cantidad) || cantidad <= 0) return null;
  return cantidad * unidad;
}

/**
 * Cuántas veces cabe el tamaño más chico en el elegido.
 *
 * La base es el más chico de los que ofrece ESE producto, porque la receta
 * está escrita para él: si el jugo se vende en 500 ml y 1 litro, la receta
 * dice lo que lleva el de 500.
 *
 * Devuelve 1 —sin cambio— si el producto no tiene tamaños, si no se eligió
 * ninguno, o si alguno de los nombres no trae medida.
 */
export function factorDeTamano(tamanos: Tamano[], elegido: string): number {
  const nombre = (elegido || '').trim();
  if (!nombre || tamanos.length === 0) return 1;

  const medidas = tamanos.map((t) => medidaDe(t.nombre));
  // Con un solo nombre sin medida ya no hay con qué comparar
  if (medidas.some((m) => m === null)) return 1;

  const base = Math.min(...(medidas as number[]));
  const propia = medidaDe(nombre);
  if (propia === null || base <= 0) return 1;

  return propia / base;
}
