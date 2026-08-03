/**
 * categorias.ts
 *
 * Comparar y ordenar grupos de alimentos. Va aparte de `ajustes.ts`
 * porque esto lo usan también la tienda y el panel, que corren en el
 * navegador, y `ajustes.ts` arrastra Google Sheets: importarlo desde el
 * cliente rompe la compilación.
 */

/** Para comparar categorías sin que estorben acentos, mayúsculas o espacios. */
export function claveCategoria(nombre: string): string {
  return (nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Posición de una categoría según el orden guardado. Las que no estén en la
 * lista (una nueva que se acabe de crear) se van al final, no desaparecen.
 */
export function posicionCategoria(categoria: string, orden: string[]): number {
  const i = orden.findIndex((c) => claveCategoria(c) === claveCategoria(categoria));
  return i === -1 ? orden.length : i;
}
