/**
 * gruposGuardados.ts
 *
 * El cajón de preguntas y extras que se reusan entre productos.
 *
 * El problema que resuelve: "Tostado: Si / No" estaba capturado a mano en
 * seis productos, "Chile" en dos, y los mismos siete extras del sándwich
 * en cuatro. Cada combo nuevo obligaba a volver a teclearlos, y teclear de
 * nuevo es donde se cuelan las diferencias: el Combo Croissant se quedó
 * sin la pregunta del chile y nadie se enteró hasta verlo en pantalla.
 *
 * Aquí viven una sola vez. Al armar un producto se eligen del cajón y se
 * copian adentro, que es distinto a quedar ligados: cambiar el cajón NO
 * cambia los productos que ya lo usaron. Es a propósito. Si al Combo lunch
 * se le quita el chile serrano, eso no debe tocar al Combo 1 sin avisar;
 * lo que se quiere es no volver a escribirlo, no que todo cambie junto.
 *
 * Guardado en un ajuste, con el mismo formato que las opciones de un
 * producto más un "+" al frente para los que son extras:
 *
 *   Tostado=Si;No~Chile=Chipotle;Jalapeños;No~+Extras sándwich=Jamón:10;Pan:5
 *
 * Módulo puro, sin googleSheets: lo usa la pantalla de Productos, que
 * corre en el navegador.
 */

import type { Extra } from './extras';
import type { GrupoOpcion } from './opciones';

/** Una pregunta guardada, o un juego de extras guardado. */
export type Guardado =
  | { tipo: 'pregunta'; nombre: string; opciones: string[] }
  | { tipo: 'extras'; nombre: string; extras: Extra[] };

const SEP_ENTRADA = '~';
const SEP_NOMBRE = '=';
const SEP_ITEM = ';';
const SEP_PRECIO = ':';
/** Delante del nombre: marca que la entrada son extras y no una pregunta. */
const MARCA_EXTRAS = '+';

const limpio = (t: string) => (t ?? '').toString().trim();
export const mismoNombre = (a: string, b: string) =>
  limpio(a).toLowerCase() === limpio(b).toLowerCase();

/** El cajón, tal como quedó guardado. Vacío si nunca se guardó nada. */
export function parsearGuardados(crudo: string): Guardado[] {
  const texto = limpio(crudo);
  if (!texto) return [];

  const salida: Guardado[] = [];
  for (const tramo of texto.split(SEP_ENTRADA)) {
    const corte = tramo.indexOf(SEP_NOMBRE);
    if (corte === -1) continue;
    let nombre = limpio(tramo.slice(0, corte));
    const esExtras = nombre.startsWith(MARCA_EXTRAS);
    if (esExtras) nombre = limpio(nombre.slice(1));
    if (!nombre) continue;
    // Dos entradas con el mismo nombre serían dos botones iguales
    if (salida.some((g) => mismoNombre(g.nombre, nombre))) continue;

    const partes = tramo
      .slice(corte + 1)
      .split(SEP_ITEM)
      .map(limpio)
      .filter(Boolean);
    if (partes.length === 0) continue;

    if (esExtras) {
      const extras: Extra[] = [];
      for (const p of partes) {
        const sep = p.lastIndexOf(SEP_PRECIO);
        const nom = limpio(sep === -1 ? p : p.slice(0, sep));
        const precio = sep === -1 ? 0 : parseFloat(p.slice(sep + 1).replace(',', '.'));
        if (!nom || extras.some((x) => mismoNombre(x.nombre, nom))) continue;
        extras.push({ nombre: nom, precio: isNaN(precio) || precio < 0 ? 0 : precio });
      }
      if (extras.length > 0) salida.push({ tipo: 'extras', nombre, extras });
    } else {
      const opciones: string[] = [];
      for (const p of partes) if (!opciones.some((x) => mismoNombre(x, p))) opciones.push(p);
      if (opciones.length > 0) salida.push({ tipo: 'pregunta', nombre, opciones });
    }
  }
  return salida;
}

export function serializarGuardados(lista: Guardado[]): string {
  return lista
    .map((g) => {
      const nombre = limpio(g.nombre);
      if (!nombre) return '';
      if (g.tipo === 'extras') {
        const items = g.extras
          .filter((e) => limpio(e.nombre))
          .map((e) => `${limpio(e.nombre)}${SEP_PRECIO}${e.precio}`);
        return items.length ? `${MARCA_EXTRAS}${nombre}${SEP_NOMBRE}${items.join(SEP_ITEM)}` : '';
      }
      const items = g.opciones.map(limpio).filter(Boolean);
      return items.length ? `${nombre}${SEP_NOMBRE}${items.join(SEP_ITEM)}` : '';
    })
    .filter(Boolean)
    .join(SEP_ENTRADA);
}

/**
 * Mete una entrada al cajón, pisando la que tuviera ese nombre.
 *
 * Pisar y no duplicar: guardar "Chile" dos veces deja dos botones iguales
 * con listas distintas, y al armar un combo no hay manera de saber cuál
 * es el bueno.
 */
export function guardarEnCajon(cajon: Guardado[], entrada: Guardado): Guardado[] {
  const sin = cajon.filter((g) => !mismoNombre(g.nombre, entrada.nombre));
  return [...sin, entrada].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function quitarDelCajon(cajon: Guardado[], nombre: string): Guardado[] {
  return cajon.filter((g) => !mismoNombre(g.nombre, nombre));
}

/**
 * Las preguntas del cajón que este producto todavía no tiene.
 *
 * Ofrecer una que ya está puesta solo da a elegir algo que no hace nada,
 * o peor, la agrega repetida.
 */
export function preguntasQueFaltan(cajon: Guardado[], puestas: GrupoOpcion[]): Guardado[] {
  return cajon.filter(
    (g) => g.tipo === 'pregunta' && !puestas.some((p) => mismoNombre(p.nombre, g.nombre))
  );
}

/** Los juegos de extras del cajón, para ofrecerlos todos. */
export function juegosDeExtras(cajon: Guardado[]): Guardado[] {
  return cajon.filter((g) => g.tipo === 'extras');
}

/**
 * Junta los extras guardados con los que el producto ya traía.
 *
 * Se suman en vez de reemplazar: un licuado puede llevar los extras de
 * siempre más uno suyo, y cambiar el juego no debería borrar ese.
 */
export function sumarExtras(puestos: Extra[], nuevos: Extra[]): Extra[] {
  const salida = [...puestos];
  for (const e of nuevos) {
    if (salida.some((x) => mismoNombre(x.nombre, e.nombre))) continue;
    salida.push(e);
  }
  return salida;
}
