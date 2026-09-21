/**
 * toppingIncluido.ts
 *
 * El licuado del combo trae su topping, igual que cuando se vende solo.
 *
 * El combo no lo sabía: la bebida era un nombre en una lista ("Licuado de
 * Fresa") y no había dónde decir si llevaba granola, avena o nada. Así no
 * quedaba registro del topping y su insumo nunca se descontaba.
 *
 * Aquí, al elegir una bebida que en el menú tiene toppings, aparece una
 * pregunta más —"Topping"— con esos mismos toppings y "Sin topping". Va
 * incluido en el combo: no suma al precio. Los extras de abajo siguen
 * cobrándose como siempre.
 *
 * Se arma como un grupo de opciones más, así que lo que ya existe para
 * las opciones (validar, el resumen del ticket, la llave del renglón)
 * lo trata igual sin cambios.
 *
 * Lógica pura, sin Google Sheets: la usan la tienda, el mostrador y el
 * servidor al cobrar.
 */

import { parsearExtras } from './extras';
import type { Eleccion, GrupoOpcion } from './opciones';

/** Nombre de la pregunta; también es la etiqueta en el ticket. */
export const GRUPO_TOPPING = 'Topping';
export const SIN_TOPPING = 'Sin topping';

/** Lo único que hace falta saber de cada producto del menú. */
export interface ToppingsDeProducto {
  nombre: string;
  toppings: string[];
}

/** Desde las filas de la hoja Productos (columna Extras en texto). */
export function toppingsDeHoja(filas: { Nombre?: string; Extras?: string }[]): ToppingsDeProducto[] {
  return filas.map((f) => ({
    nombre: f.Nombre ?? '',
    toppings: parsearExtras(f.Extras ?? '').map((e) => e.nombre),
  }));
}

const clave = (t: string) =>
  (t ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * El producto del menú al que se refiere una opción.
 *
 * El Combo 1 dice la bebida con su nombre completo ("Licuado de Fresa");
 * el Combo Croissant solo el sabor ("Fresa") bajo la pregunta "Licuado".
 * Se aceptan las dos formas.
 */
export function productoDeOpcion(
  grupo: string,
  opcion: string,
  productos: ToppingsDeProducto[]
): ToppingsDeProducto | undefined {
  const exacto = clave(opcion);
  const armado = clave(`${grupo} de ${opcion}`);
  return (
    productos.find((p) => clave(p.nombre) === exacto) ??
    productos.find((p) => clave(p.nombre) === armado)
  );
}

/**
 * Los grupos del producto más, si hace falta, la pregunta del topping.
 *
 * Solo aparece cuando ya se eligió una bebida que tiene toppings en el
 * menú; si se cambia a un jugo sin toppings, la pregunta se va.
 */
export function gruposConTopping(
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined,
  productos: ToppingsDeProducto[]
): GrupoOpcion[] {
  if (grupos.some((g) => g.nombre === GRUPO_TOPPING)) return grupos;
  for (let i = 0; i < grupos.length; i++) {
    const g = grupos[i];
    const valor = eleccion?.[g.nombre];
    if (!valor) continue;
    const toppings = productoDeOpcion(g.nombre, valor, productos)?.toppings ?? [];
    if (toppings.length === 0) continue;
    // Justo debajo de la bebida: es de ella de quien se está hablando
    return [
      ...grupos.slice(0, i + 1),
      { nombre: GRUPO_TOPPING, opciones: [...toppings, SIN_TOPPING] },
      ...grupos.slice(i + 1),
    ];
  }
  return grupos;
}

/**
 * Si se cambió de bebida, el topping elegido para la anterior puede ya no
 * existir en la nueva (la proteína solo va en el de plátano). Se borra
 * para volver a preguntar en vez de guardar algo que no se ofrece.
 */
export function limpiarTopping(
  grupos: GrupoOpcion[],
  eleccion: Eleccion,
  productos: ToppingsDeProducto[]
): Eleccion {
  const actual = eleccion[GRUPO_TOPPING];
  if (!actual) return eleccion;
  const grupo = gruposConTopping(grupos, eleccion, productos).find(
    (g) => g.nombre === GRUPO_TOPPING
  );
  if (grupo?.opciones.some((o) => clave(o) === clave(actual))) return eleccion;
  const resto = { ...eleccion };
  delete resto[GRUPO_TOPPING];
  return resto;
}

/**
 * El topping incluido, leído del nombre guardado del renglón
 * ("Combo 1 (… · Topping: Avena)"). Es lo que permite descontar su
 * insumo: DT PEDIDOS no tiene columna para esto.
 */
export function toppingDesdeNombre(nombre: string): string {
  const m = /\(([^()]*)\)\s*$/.exec((nombre ?? '').trim());
  const parte = (m?.[1] ?? '')
    .split('·')
    .map((x) => x.trim())
    .find((x) => clave(x).startsWith(`${clave(GRUPO_TOPPING)}:`));
  const valor = parte ? parte.slice(parte.indexOf(':') + 1).trim() : '';
  return clave(valor) === clave(SIN_TOPPING) ? '' : valor;
}
