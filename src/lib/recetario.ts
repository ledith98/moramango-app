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
];

// Columnas 1-based para updateCell
export const COL_REC = {
  idProducto: 2,
  idBiblioteca: 3,
  cantidad: 4,
  merma: 5,
  notas: 6,
} as const;

export async function prepararRecetario(): Promise<void> {
  await ensureSheet(HOJA_RECETARIO, COLS_RECETARIO);
}

/**
 * Traduce el Recetario al formato que ya entienden consumoPorInsumo y
 * disponibilidadPorProducto, que trabajan con las columnas de Catalogo.
 * Así el recetario nuevo se enchufa sin reescribir esos cálculos.
 */
export function recetarioComoCatalogo(
  recetario: Record<string, string>[],
  biblioteca: Record<string, string>[]
): Record<string, string>[] {
  const nombrePorId = new Map(biblioteca.map((b) => [b.ID_Biblioteca, b.Nombre || '']));

  return recetario
    .filter((r) => r.ID_Producto && r.ID_Biblioteca)
    .map((r) => ({
      ID_Producto: r.ID_Producto,
      // El vínculo real es por ID; el nombre se resuelve al leer, así que
      // renombrar un insumo nunca rompe una receta.
      Ingrediente: nombrePorId.get(r.ID_Biblioteca) ?? '',
      Cantidad_Receta: r.Cantidad || '0',
      Merma_Pct: r.Merma_Pct || '',
    }))
    .filter((r) => r.Ingrediente);
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
