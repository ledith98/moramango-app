/**
 * insumos.ts
 *
 * Cálculo de consumo de insumos a partir de las recetas (hoja Catalogo).
 *
 * La llave entre receta e insumo es el NOMBRE: Catalogo.Ingrediente ↔
 * Insumos["Nombre insumo"]. Se compara normalizado (trim + minúsculas)
 * para tolerar diferencias de mayúsculas o espacios.
 */

export const normalizarNombre = (s: string | undefined | null): string =>
  (s ?? '').trim().toLowerCase();

// Grupos fijos del inventario (columna Categoria en la hoja Insumos).
// El orden aquí es el orden en que se muestran en el panel.
export const CATEGORIAS_INSUMOS = [
  'Verduras y frutas',
  'Pan',
  'Jamón y queso',
  'Leche y agua',
  'Complementos',
  'Empaque',
  'Condimentos',
] as const;

// Margen de frescura: 'Verduras y frutas' compradas hace más de estos
// días se marcan para revisar.
export const DIAS_FRESCURA = 3;
export const CATEGORIA_FRESCOS = 'Verduras y frutas';

/**
 * Factor multiplicador por merma. Heurística de formato:
 * - valor > 1 se interpreta como porcentaje (5 → ×1.05)
 * - valor ≤ 1 como fracción (0.05 → ×1.05)
 * - vacío/inválido → ×1 (sin merma)
 */
export function factorMerma(mermaPct: string | undefined): number {
  const pct = parseFloat((mermaPct ?? '').toString().replace(',', '.').replace('%', ''));
  if (isNaN(pct) || pct <= 0) return 1;
  return pct > 1 ? 1 + pct / 100 : 1 + pct;
}

/**
 * Consumo total por insumo para una lista de items vendidos.
 * Devuelve un Map cuya clave es el nombre normalizado del ingrediente.
 */
export function consumoPorInsumo(
  items: { idProducto: string; cantidad: number }[],
  catalogo: Record<string, string>[]
): Map<string, number> {
  const consumo = new Map<string, number>();

  for (const item of items) {
    if (!item.idProducto || item.cantidad <= 0) continue;
    const recetas = catalogo.filter((c) => c.ID_Producto === item.idProducto);

    for (const receta of recetas) {
      const clave = normalizarNombre(receta.Ingrediente);
      if (!clave) continue;

      const porUnidad = parseFloat(receta.Cantidad_Receta) || 0;
      const total = porUnidad * item.cantidad * factorMerma(receta.Merma_Pct);
      if (total <= 0) continue;

      consumo.set(clave, (consumo.get(clave) || 0) + total);
    }
  }

  return consumo;
}
