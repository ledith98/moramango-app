/**
 * ids.ts
 *
 * Claves consecutivas para las hojas que las llevan (BIB-007, ACT-012,
 * REC-0160).
 *
 * Vivía duplicado y mal en cada endpoint: se usaba `filas.length + 1`, que
 * cuenta renglones en vez de mirar las claves. Basta con que una fila se
 * borre o quede vacía para que el contador retroceda y la clave nueva pise
 * una que ya existe. Cuando dos registros comparten clave, el que se lee
 * por clave es el último y el otro queda invisible: su existencia y sus
 * recetas se le atribuyen al equivocado. Ya pasó con BIB-064 y BIB-065.
 */

/** La clave más alta que exista, más uno. Nunca repite. */
export function siguienteId(
  filas: Record<string, string>[],
  campo: string,
  prefijo: string,
  digitos = 3
): string {
  const mayor = filas.reduce((max, f) => {
    const n = parseInt((f[campo] ?? '').toString().replace(`${prefijo}-`, ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefijo}-${String(mayor + 1).padStart(digitos, '0')}`;
}
