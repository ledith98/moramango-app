/**
 * extras.ts
 *
 * Toppings y agregados que suben el precio: chía, granola, proteína…
 *
 * Se diferencian de las opciones (`opciones.ts`) en dos cosas: aquí el
 * cliente puede elegir varios o ninguno, y cada uno cuesta.
 *
 * Van en una columna `Extras` de la hoja Productos con el mismo formato
 * que los tamaños —`Chía:10|Granola:15`— así que se aprovecha su lectura
 * y escritura en vez de repetirla.
 */

import { iguales, parsearTamanos, serializarTamanos, type Tamano } from './tamanos';

/** Un topping: su nombre y lo que suma al precio. */
export type Extra = Tamano;

export const parsearExtras = parsearTamanos;
export const serializarExtras = serializarTamanos;

/**
 * Comprueba que los toppings elegidos existan y devuelve su precio real.
 * Ninguno elegido es válido: los extras son opcionales por definición.
 */
export function validarExtras(
  disponibles: Extra[],
  elegidos: unknown
): { ok: true; extras: Extra[] } | { ok: false; error: string } {
  if (elegidos === undefined || elegidos === null) return { ok: true, extras: [] };
  if (!Array.isArray(elegidos)) return { ok: false, error: 'Extras inválidos' };

  const salida: Extra[] = [];
  for (const e of elegidos) {
    // Se acepta tanto el nombre suelto como el objeto que manda la tienda
    const nombre = (typeof e === 'string' ? e : (e as Extra)?.nombre ?? '').toString().trim();
    if (!nombre) continue;
    const real = disponibles.find((d) => iguales(d.nombre, nombre));
    if (!real) return { ok: false, error: `No tenemos "${nombre}" como extra` };
    // Repetir el mismo topping cobraría doble sin que se note en pantalla
    if (salida.some((s) => iguales(s.nombre, real.nombre))) continue;
    salida.push(real);
  }
  return { ok: true, extras: salida };
}

/** Lo que suman al precio del renglón. */
export function precioExtras(extras: Extra[]): number {
  return extras.reduce((s, e) => s + e.precio, 0);
}

/** "+ Chía · + Granola" para el ticket y el renglón del carrito. */
export function resumenExtras(extras: Extra[]): string {
  return extras.map((e) => `+ ${e.nombre}`).join(' · ');
}

/**
 * Los extras que se pidieron, leídos del nombre guardado del renglón.
 *
 * El pedido guarda "Licuado de Plátano (+ Avena)"; para descontar los 20 g
 * de avena hay que saber que se pidió. Es el único lugar donde queda
 * registrado: DT PEDIDOS no tiene columna de extras.
 */
export function extrasDesdeNombre(nombre: string): string[] {
  const m = /\(([^()]*)\)\s*$/.exec((nombre ?? '').trim());
  return (m?.[1] ?? '')
    .split('·')
    .map((x) => x.trim())
    .filter((x) => x.startsWith('+'))
    .map((x) => x.slice(1).trim())
    .filter(Boolean);
}

/**
 * Parte de la llave del renglón. Se ordena para que elegir chía y luego
 * granola caiga en el mismo renglón que al revés.
 */
export function claveExtras(extras: Extra[]): string {
  return extras
    .map((e) => e.nombre.trim().toLowerCase())
    .sort()
    .join(',');
}

/**
 * El mismo topping escrito de otra forma.
 *
 * "Jamon" y "Jamón" son lo mismo; "Jalapeño" y "Jalapeños" también. Sin
 * esto se veían como toppings distintos y había que mantenerles el precio
 * por separado — que es justo el trabajo que el catálogo viene a quitar.
 *
 * Se quitan acentos, mayúsculas y la -s final. La -s se corta solo en
 * palabras de más de tres letras para no confundir "Pan" con "Pa".
 */
export function claveExtra(nombre: string): string {
  return (nombre ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p))
    .join(' ');
}

/** Un topping del catálogo, con en cuántos productos se usa. */
export interface ExtraConocido extends Extra {
  usos: number;
}

/**
 * Los toppings que ya existen en el menú, del más usado al menos.
 *
 * Sirve para proponerlos al agregar uno nuevo: casi siempre el topping
 * que se va a poner ya está en otro producto, y volver a teclearlo es la
 * puerta por la que entran "Jamon" y "Queso suizo".
 *
 * Cuando el mismo topping aparece con precios distintos gana el más
 * repetido — es el que está bien en más lugares.
 */
export function catalogoExtras(listas: string[]): ExtraConocido[] {
  const porClave = new Map<string, { nombre: string; precios: Map<number, number> }>();

  for (const crudo of listas) {
    for (const e of parsearExtras(crudo)) {
      const clave = claveExtra(e.nombre);
      if (!clave) continue;
      if (!porClave.has(clave)) porClave.set(clave, { nombre: e.nombre, precios: new Map() });
      const x = porClave.get(clave)!;
      x.precios.set(e.precio, (x.precios.get(e.precio) ?? 0) + 1);
    }
  }

  return [...porClave.values()]
    .map(({ nombre, precios }) => {
      const [precio] = [...precios.entries()].sort((a, b) => b[1] - a[1])[0];
      return { nombre, precio, usos: [...precios.values()].reduce((s, n) => s + n, 0) };
    })
    .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre));
}
