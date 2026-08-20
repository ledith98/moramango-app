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
  'Frutas y verduras',
  'Pan',
  'Jamón y queso',
  'Leche y agua',
  'Complementos',
  'Empaque',
  'Condimentos',
] as const;

// Margen de frescura: 'Frutas y verduras' compradas hace más de estos
// días se marcan para revisar.
export const DIAS_FRESCURA = 3;
export const CATEGORIA_FRESCOS = 'Frutas y verduras';

/**
 * Convierte una fecha de <input type="date"> (YYYY-MM-DD) al formato
 * es-MX que usa el resto del sistema (D/M/AAAA, 12:00:00 p.m.), sin
 * pasar por Date() para evitar corrimientos de zona horaria.
 * Devuelve null si el formato no es válido.
 */
export function fechaCompraDesdeISO(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim());
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yyyy}, 12:00:00 p.m.`;
}

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
  items: { idProducto: string; cantidad: number; factor?: number; extras?: string[] }[],
  catalogo: Record<string, string>[]
): Map<string, number> {
  const consumo = new Map<string, number>();
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  for (const item of items) {
    if (!item.idProducto || item.cantidad <= 0) continue;
    const recetas = catalogo.filter((c) => c.ID_Producto === item.idProducto);

    for (const receta of recetas) {
      // Renglones que solo aplican si se pidió cierto extra: la avena del
      // licuado se descuenta nada más cuando se pidió con avena.
      const pide = (receta.Extra_Requerido || '').trim();
      if (pide && !(item.extras ?? []).some((e) => igual(e, pide))) continue;
      const clave = normalizarNombre(receta.Ingrediente);
      if (!clave) continue;

      const porUnidad = parseFloat(receta.Cantidad_Receta) || 0;
      // `factor` es cuántas porciones vale el tamaño vendido: un litro son
      // dos veces la receta de 500 ml. Sin tamaño vale 1 y no cambia nada.
      const porciones = item.factor && item.factor > 0 ? item.factor : 1;
      const total = porUnidad * item.cantidad * porciones * factorMerma(receta.Merma_Pct);
      if (total <= 0) continue;

      consumo.set(clave, (consumo.get(clave) || 0) + total);
    }
  }

  return consumo;
}
