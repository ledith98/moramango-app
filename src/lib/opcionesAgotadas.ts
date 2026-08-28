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
 * A qué producto del menú se refiere una opción de combo.
 *
 * Las opciones no siempre se escriben con el nombre completo del
 * producto. El Combo Croissant ofrece "Plátano", "Fresa" y "Mango", y los
 * productos se llaman "Licuado de Plátano", "Licuado de Fresa"… Como el
 * enlace era por nombre exacto, ese combo nunca se enteraba de que el
 * licuado se había acabado.
 *
 * El nombre del grupo es lo que desambigua: el grupo se llama "Licuado",
 * así que "Mango" es el licuado y no el jugo. Sin esa pista, "Mango"
 * podría ser cualquiera de los dos y se prefiere no adivinar: una opción
 * apagada por error deja al cliente sin poder pedir algo que sí hay.
 *
 * @param productos nombres de TODOS los productos del menú
 * @returns el nombre del producto, o null si no se puede saber
 */
export function productoDeOpcion(
  grupo: string,
  opcion: string,
  productos: string[]
): string | null {
  const clave = claveNombre(opcion);

  // 1. El nombre completo, tal cual
  const exacto = productos.find((p) => claveNombre(p) === clave);
  if (exacto) return exacto;

  /**
   * 2. El grupo como prefijo: "Licuado" + "Plátano" = "Licuado de Plátano".
   *
   * Y hasta aquí. Se probó también aceptar cualquier producto que
   * TERMINARA con la palabra de la opción, y resultó peligroso: en el
   * grupo "Queso", la opción "Queso suizo" enganchaba con el "Sándwich de
   * Jamón y Queso Suizo". Si se acababa el sándwich, el combo apagaba el
   * queso — apagar la opción equivocada deja al cliente sin poder pedir
   * algo que sí hay, que es peor que no apagar nada.
   */
  const conGrupo = [`${grupo} de ${opcion}`, `${grupo} ${opcion}`].map(claveNombre);
  return productos.find((p) => conGrupo.includes(claveNombre(p))) ?? null;
}

/**
 * Nombres de las opciones que hoy no se pueden preparar.
 *
 * `agotados` trae los nombres de productos que no se venden. Una opción
 * que NO corresponde a ningún producto —"Sí"/"No" del tostado, o un
 * "Queso panela" que no está en el menú por separado— nunca se marca
 * agotada: no hay nada que revisar, y apagarla dejaría el combo inservible.
 *
 * `productos` es opcional para no romper a quien ya llamaba con dos
 * argumentos; sin esa lista solo se reconocen los nombres exactos, que es
 * como funcionaba antes.
 */
export function agotadasDeGrupos(
  grupos: GrupoOpcion[],
  agotados: Set<string>,
  productos: string[] = []
): string[] {
  const salida: string[] = [];
  for (const g of grupos) {
    for (const o of g.opciones) {
      if (agotados.has(claveNombre(o))) {
        salida.push(o);
        continue;
      }
      if (productos.length === 0) continue;
      const producto = productoDeOpcion(g.nombre, o, productos);
      if (producto && agotados.has(claveNombre(producto))) salida.push(o);
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
