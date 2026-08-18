/**
 * recetario.ts
 *
 * El Recetario es la fuente de verdad de qué lleva cada producto.
 *
 * Nace para corregir tres cosas de la hoja Catalogo, que se llenó a mano:
 *
 *  1. El ingrediente se guarda por ID_Biblioteca, no por nombre escrito.
 *     En Catalogo había 36 nombres que no correspondían a ningún insumo,
 *     así que el consumo salía en cero.
 *  2. La unidad NO se guarda: se hereda del insumo. En Catalogo convivían
 *     'g' con 'grs', 'porciones' con 'porción', y hasta un ingrediente
 *     ("Fruta") usado con tres unidades distintas.
 *  3. El costo NO se guarda: se calcula con el último precio de compra
 *     real. En Catalogo eran 126 valores tecleados que envejecían solos.
 *
 * Catalogo se conserva intacta: sigue siendo la hoja de costeo de la
 * dueña (tiene fórmulas VLOOKUP y SUMIF) y el respaldo de esta migración.
 */

import { ensureSheet, getSheetData } from './googleSheets';
import { HOJA_BIBLIOTECA } from './inventario';

export const HOJA_RECETARIO = 'Recetario';

/**
 * El orden ES el orden de columnas. Agregar siempre AL FINAL y actualizar
 * COL_REC.
 */
export const COLS_RECETARIO = [
  'ID_Linea',
  'ID_Producto',
  'ID_Biblioteca',
  'Cantidad',
  'Merma_Pct',
  'Notas',
  // Un renglon puede ser OTRO PRODUCTO en vez de un insumo: es como se
  // arma un combo. Con esto el Combo 1 se declara "un sandwich + un
  // jugo" en vez de recapturar los ingredientes de los dos, y cuando
  // cambie la receta del sandwich el combo se entera solo.
  'ID_Componente',
];

// Columnas 1-based para updateCell
export const COL_REC = {
  idProducto: 2,
  idBiblioteca: 3,
  cantidad: 4,
  merma: 5,
  notas: 6,
  idComponente: 7,
} as const;

export async function prepararRecetario(): Promise<void> {
  await ensureSheet(HOJA_RECETARIO, COLS_RECETARIO);
}

/**
 * Máximo de niveles al desarmar un combo. Un combo que lleva un combo que
 * lleva un combo ya no es un menú, es un error de captura.
 */
const PROFUNDIDAD_MAX = 4;

/**
 * Desarma los renglones que apuntan a otro producto hasta quedarse solo
 * con insumos.
 *
 * El Combo 1 declara "1 sándwich + 1 jugo"; para descontar inventario hay
 * que saber que eso son 60 g de jamón, 40 g de queso, 240 g de mango…
 * Esta función hace esa traducción, multiplicando por la cantidad de cada
 * nivel: 2 combos que llevan 1 jugo cada uno son 2 jugos.
 *
 * `visitados` corta las referencias circulares. Si alguien pone que el
 * Combo 1 lleva Combo 1, sin esto el cálculo no terminaría nunca.
 */
function insumosDe(
  idProducto: string,
  factor: number,
  porProducto: Map<string, Record<string, string>[]>,
  visitados: Set<string>,
  nivel = 0
): { idBiblioteca: string; cantidad: number; merma: string }[] {
  if (nivel >= PROFUNDIDAD_MAX || visitados.has(idProducto)) return [];
  const propios = new Set(visitados);
  propios.add(idProducto);

  const salida: { idBiblioteca: string; cantidad: number; merma: string }[] = [];
  for (const r of porProducto.get(idProducto) ?? []) {
    const cantidad = (parseFloat(r.Cantidad) || 0) * factor;
    if (cantidad <= 0) continue;

    if (r.ID_Componente) {
      salida.push(
        ...insumosDe(r.ID_Componente, cantidad, porProducto, propios, nivel + 1)
      );
    } else if (r.ID_Biblioteca) {
      salida.push({
        idBiblioteca: r.ID_Biblioteca,
        cantidad,
        merma: r.Merma_Pct || '',
      });
    }
  }
  return salida;
}

/**
 * Traduce el Recetario al formato que ya entienden consumoPorInsumo y
 * disponibilidadPorProducto, que trabajan con las columnas de Catalogo.
 * Así el recetario nuevo se enchufa sin reescribir esos cálculos.
 *
 * Los combos se desarman aquí: quien consume esto ve solo insumos, sin
 * enterarse de que un producto podía estar hecho de otros.
 */
export function recetarioComoCatalogo(
  recetario: Record<string, string>[],
  biblioteca: Record<string, string>[]
): Record<string, string>[] {
  const nombrePorId = new Map(biblioteca.map((b) => [b.ID_Biblioteca, b.Nombre || '']));

  const porProducto = new Map<string, Record<string, string>[]>();
  for (const r of recetario) {
    if (!r.ID_Producto) continue;
    if (!porProducto.has(r.ID_Producto)) porProducto.set(r.ID_Producto, []);
    porProducto.get(r.ID_Producto)!.push(r);
  }

  const salida: Record<string, string>[] = [];
  for (const idProducto of porProducto.keys()) {
    for (const l of insumosDe(idProducto, 1, porProducto, new Set())) {
      // El vínculo real es por ID; el nombre se resuelve al leer, así que
      // renombrar un insumo nunca rompe una receta.
      const nombre = nombrePorId.get(l.idBiblioteca) ?? '';
      if (!nombre) continue;
      salida.push({
        ID_Producto: idProducto,
        Ingrediente: nombre,
        Cantidad_Receta: String(l.cantidad),
        Merma_Pct: l.merma,
      });
    }
  }
  return salida;
}

/**
 * Las recetas vigentes, en el formato de Catalogo, para los cálculos de
 * consumo y disponibilidad.
 *
 * Si el Recetario todavía no tiene renglones se cae a Catalogo: así la
 * app funciona igual antes y después de migrar, y si algo sale mal la
 * hoja vieja sigue siendo una red de seguridad.
 */
export async function leerRecetas(): Promise<Record<string, string>[]> {
  try {
    const [recetario, biblioteca] = await Promise.all([
      getSheetData(HOJA_RECETARIO, { crudo: true }),
      getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    ]);
    const recetas = recetarioComoCatalogo(recetario, biblioteca);
    if (recetas.length > 0) return recetas;
  } catch {
    // hoja aún sin crear
  }
  return getSheetData('Catalogo');
}
