/**
 * opcionesAgotadas.ts
 *
 * Un combo se arma con productos del menú: "Jugo de Mango" dentro del
 * Combo 1 es el mismo jugo que se vende suelto. Si el jugo se acaba, el
 * combo lo seguía ofreciendo y había que decírselo al cliente en la cara.
 *
 * La liga entre la opción y el producto es el NOMBRE. No es una llave
 * bonita, pero es la que ya existe: las opciones se escriben a mano en el
 * panel eligiendo de los productos que hay. Se compara sin acentos ni
 * mayúsculas para que "chocobanana" y "Chocobanana" sean el mismo.
 *
 * Lógica pura: la usan la tienda, el mostrador y el servidor al cobrar.
 */

import type { GrupoOpcion } from './opciones';

/** Para comparar nombres de producto sin que estorbe cómo se escribieron. */
export function claveNombre(nombre: string): string {
  return (nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Nombres de las opciones que hoy no se pueden preparar.
 *
 * `agotados` trae los nombres de productos que no se venden. Una opción
 * que NO corresponde a ningún producto —"Sí"/"No" del tostado, o un
 * "Queso panela" que no está en el menú por separado— nunca se marca
 * agotada: no hay nada que revisar, y apagarla dejaría el combo inservible.
 */
export function agotadasDeGrupos(grupos: GrupoOpcion[], agotados: Set<string>): string[] {
  const salida: string[] = [];
  for (const g of grupos) {
    for (const o of g.opciones) {
      if (agotados.has(claveNombre(o))) salida.push(o);
    }
  }
  return salida;
}

/**
 * ¿Queda algún grupo sin una sola opción disponible?
 *
 * Si se acabaron TODOS los jugos y licuados, el Combo 1 no se puede armar
 * de ninguna manera y hay que sacarlo del menú, no dejar que el cliente
 * abra la ficha y descubra que no puede elegir nada.
 */
export function comboImposible(grupos: GrupoOpcion[], agotadas: string[]): boolean {
  if (grupos.length === 0) return false;
  const fuera = new Set(agotadas.map(claveNombre));
  return grupos.some((g) => g.opciones.every((o) => fuera.has(claveNombre(o))));
}
