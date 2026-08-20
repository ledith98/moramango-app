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
