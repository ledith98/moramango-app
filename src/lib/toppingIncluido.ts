/**
 * toppingIncluido.ts
 *
 * El licuado del combo trae su topping, igual que cuando se vende solo.
 *
 * El combo no lo sabía: la bebida era un nombre en una lista ("Licuado de
 * Fresa") y no había dónde decir si llevaba granola, avena o nada. Así no
 * quedaba registro del topping y su insumo nunca se descontaba.
 *
 * Las reglas del local:
 *   - Al elegir una bebida que en el menú tiene toppings, se pregunta
 *     "Topping": uno va incluido en el combo, sin costo, o "Sin topping".
 *   - Hay toppings que NUNCA van incluidos (la proteína): se cobran
 *     siempre. Cuáles son se edita en Ajustes, no en código.
 *   - Del segundo topping en adelante, y los que siempre se cobran, se
 *     ofrecen aparte como "Más toppings" con su precio.
 *
 * Lo mismo vale para el licuado que se vende solo (500 ml o 1 litro):
 * sus propios toppings se preguntan igual, uno incluido y los demás con
 * costo. Eso es lo que dice el menú: "Incluye 1 topping sin costo".
 *
 * El incluido se arma como un grupo de opciones más, así que lo que ya
 * existe para las opciones (validar, el resumen del ticket, la llave del
 * renglón) lo trata igual sin cambios. Los de costo son extras normales.
 *
 * Lógica pura, sin Google Sheets: la usan la tienda, el mostrador y el
 * servidor al cobrar.
 */

import { claveExtra, type Extra, parsearExtras } from './extras';
import type { Eleccion, GrupoOpcion } from './opciones';

/** Nombre de la pregunta; también es la etiqueta en el ticket. */
export const GRUPO_TOPPING = 'Topping';
export const SIN_TOPPING = 'Sin topping';

/** Si nadie lo ha cambiado en Ajustes, la proteína es la que se cobra. */
export const TOPPINGS_CON_COSTO_DEFAULT = ['Scoop proteina'];

/** Lo único que hace falta saber de cada producto del menú. */
export interface ToppingsDeProducto {
  nombre: string;
  toppings: Extra[];
}

/** Desde las filas de la hoja Productos (columna Extras en texto). */
export function toppingsDeHoja(filas: { Nombre?: string; Extras?: string }[]): ToppingsDeProducto[] {
  return filas.map((f) => ({ nombre: f.Nombre ?? '', toppings: parsearExtras(f.Extras ?? '') }));
}

const mismo = (a: string, b: string) => claveExtra(a) === claveExtra(b);

/**
 * Los toppings propios que pueden ir incluidos: solo en los licuados. El
 * jamón del sándwich o las saladitas de la ensalada siguen siendo extras
 * que se cobran todos.
 */
export function toppingsPropios(categoria: string, extras: Extra[]): Extra[] {
  const cat = (categoria ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return cat.includes('licuado') ? extras : [];
}

/** ¿Este topping se cobra siempre, aunque sea el primero? */
export function siempreConCosto(nombre: string, conCosto: string[]): boolean {
  return conCosto.some((c) => mismo(c, nombre));
}

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
  const clave = (t: string) => t.trim().toLowerCase().normalize('NFC');
  const exacto = clave(opcion);
  const armado = clave(`${grupo} de ${opcion}`);
  return (
    productos.find((p) => clave(p.nombre) === exacto) ??
    productos.find((p) => clave(p.nombre) === armado)
  );
}

/** La bebida elegida que trae toppings, y en qué grupo se eligió. */
function bebidaConToppings(
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined,
  productos: ToppingsDeProducto[]
): { indice: number; toppings: Extra[] } | null {
  for (let i = 0; i < grupos.length; i++) {
    const valor = eleccion?.[grupos[i].nombre];
    if (!valor) continue;
    const toppings = productoDeOpcion(grupos[i].nombre, valor, productos)?.toppings ?? [];
    if (toppings.length > 0) return { indice: i, toppings };
  }
  return null;
}

/**
 * Los grupos del producto más, si hace falta, la pregunta del topping
 * incluido.
 *
 * Solo aparece cuando ya se eligió una bebida que tiene toppings en el
 * menú; si se cambia a un jugo sin toppings, la pregunta se va. Los que se
 * cobran siempre no se ofrecen aquí.
 */
export function gruposConTopping(
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined,
  productos: ToppingsDeProducto[],
  conCosto: string[],
  /** Toppings del propio producto (licuado suelto); vacío en lo demás */
  propios: Extra[] = []
): GrupoOpcion[] {
  if (grupos.some((g) => g.nombre === GRUPO_TOPPING)) return grupos;
  if (propios.length > 0) {
    const incluibles = propios.map((t) => t.nombre).filter((n) => !siempreConCosto(n, conCosto));
    if (incluibles.length === 0) return grupos;
    return [...grupos, { nombre: GRUPO_TOPPING, opciones: [...incluibles, SIN_TOPPING] }];
  }
  const bebida = bebidaConToppings(grupos, eleccion, productos);
  if (!bebida) return grupos;
  const incluibles = bebida.toppings
    .map((t) => t.nombre)
    .filter((n) => !siempreConCosto(n, conCosto));
  if (incluibles.length === 0) return grupos;
  // Justo debajo de la bebida: es de ella de quien se está hablando
  return [
    ...grupos.slice(0, bebida.indice + 1),
    { nombre: GRUPO_TOPPING, opciones: [...incluibles, SIN_TOPPING] },
    ...grupos.slice(bebida.indice + 1),
  ];
}

/**
 * Los toppings de la bebida que se pueden agregar pagando: todos, incluso
 * el que ya va incluido — pedirlo otra vez es la porción doble. Aquí caen
 * la proteína y el segundo topping.
 */
export function toppingsConCostoDeBebida(
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined,
  productos: ToppingsDeProducto[]
): Extra[] {
  return bebidaConToppings(grupos, eleccion, productos)?.toppings ?? [];
}

/** ¿Este extra es otra porción del topping que ya va incluido? */
export function esPorcionDoble(nombre: string, eleccion: Eleccion | undefined): boolean {
  const incluido = eleccion?.[GRUPO_TOPPING] ?? '';
  return !!incluido && mismo(nombre, incluido);
}

/**
 * Todos los extras que se pueden cobrar en el renglón: los del producto y
 * los de la bebida. Si el nombre se repite gana el del producto.
 */
export function extrasPermitidos(
  propios: Extra[],
  grupos: GrupoOpcion[],
  eleccion: Eleccion | undefined,
  productos: ToppingsDeProducto[],
  /** Licuado suelto: sus propios toppings, también el incluido (doble) */
  propiosIncluibles = false
): Extra[] {
  if (propiosIncluibles) return propios;
  const deBebida = toppingsConCostoDeBebida(grupos, eleccion, productos).filter(
    (t) => !propios.some((p) => mismo(p.nombre, t.nombre))
  );
  return [...propios, ...deBebida];
}

/**
 * Al cambiar de bebida, lo elegido para la anterior puede ya no existir en
 * la nueva (la proteína solo va en el de plátano). Se borra para volver a
 * preguntar en vez de guardar algo que no se ofrece.
 */
export function limpiarTopping(
  grupos: GrupoOpcion[],
  eleccion: Eleccion,
  productos: ToppingsDeProducto[],
  conCosto: string[],
  propios: Extra[] = []
): Eleccion {
  const actual = eleccion[GRUPO_TOPPING];
  if (!actual) return eleccion;
  const grupo = gruposConTopping(grupos, eleccion, productos, conCosto, propios).find(
    (g) => g.nombre === GRUPO_TOPPING
  );
  if (grupo?.opciones.some((o) => mismo(o, actual))) return eleccion;
  const resto = { ...eleccion };
  delete resto[GRUPO_TOPPING];
  return resto;
}

/** Quita de lo marcado lo que ya no se ofrece (se cambió de bebida). */
export function limpiarExtras(elegidos: Extra[], permitidos: Extra[]): Extra[] {
  return elegidos.filter((e) => permitidos.some((p) => mismo(p.nombre, e.nombre)));
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
    .find((x) => x.toLowerCase().startsWith(`${GRUPO_TOPPING.toLowerCase()}:`));
  const valor = parte ? parte.slice(parte.indexOf(':') + 1).trim() : '';
  return mismo(valor, SIN_TOPPING) ? '' : valor;
}
