/**
 * disponibilidad.ts
 *
 * Cuántas unidades de cada producto alcanzan a salir con el stock que hay.
 *
 * La cuenta es el ingrediente más escaso: si hay pan para 12 sándwiches
 * pero queso para 8, se pueden hacer 8. Ese número gobierna el aviso de
 * "últimas piezas" y el bloqueo de compra en la tienda.
 *
 * Dos reglas deliberadas:
 *
 *  1. El EMPAQUE no bloquea la venta. Quedarse sin vasos apagaría medio
 *     menú por un conteo que se desactualiza fácil; esos insumos avisan
 *     en el panel y ya.
 *  2. Un producto sin receta —o cuyos ingredientes no están vinculados a
 *     ningún insumo— devuelve null: SIN LÍMITE. Así la función se puede
 *     estrenar sin apagar nada mientras el inventario se termina de armar.
 */

import { factorMerma, normalizarNombre } from './insumos';
import { clavesDeInsumo, estaEnUso } from './inventario';

/** Categoría cuyos insumos avisan pero nunca detienen una venta. */
export const CATEGORIA_NO_BLOQUEA = 'Empaque';

export interface DisponibilidadProducto {
  /** Unidades que alcanzan a hacerse. null = sin datos, sin límite. */
  disponibles: number | null;
  /** Insumo que marca el tope, para poder explicarlo en el panel. */
  limitadoPor: string;
}

/**
 * @param catalogo   filas de la hoja Catalogo (receta por producto)
 * @param biblioteca insumos del catálogo base
 * @param activos    stock actual, en unidad de receta
 */
export function disponibilidadPorProducto(
  catalogo: Record<string, string>[],
  biblioteca: Record<string, string>[],
  activos: Record<string, string>[]
): Map<string, DisponibilidadProducto> {
  // Stock por nombre de ingrediente, siguiendo el vínculo manual
  const stockPorIngrediente = new Map<string, { stock: number; nombre: string; bloquea: boolean }>();

  const activoPorBib = new Map(activos.map((a) => [a.ID_Biblioteca, a]));

  for (const bib of biblioteca) {
    if ((bib.Eliminado || '').toLowerCase() === 'si') continue;
    const activo = activoPorBib.get(bib.ID_Biblioteca);
    if (!activo || !estaEnUso(activo.En_Uso)) continue;

    const stock = parseFloat(activo.Stock_Actual) || 0;

    // Un insumo en cero que NUNCA se compró ni se contó no significa
    // "se acabó", significa "todavía no lo inventarío". Si contara, dar
    // de alta un insumo apagaría los productos que lo usan aunque haya
    // mercancía en el mostrador. Empieza a mandar en cuanto se registra
    // la primera compra o el primer conteo.
    const seLlevaInventario =
      stock > 0 ||
      !!(activo.Ultima_Compra || '').trim() ||
      !!(activo.Fecha_Conteo || '').trim();
    if (!seLlevaInventario) continue;
    const bloquea = (bib.Categoria || '').trim() !== CATEGORIA_NO_BLOQUEA;

    for (const clave of clavesDeInsumo(bib)) {
      // Si dos insumos cubren el mismo ingrediente, suman: son sustitutos
      const previo = stockPorIngrediente.get(clave);
      stockPorIngrediente.set(clave, {
        stock: (previo?.stock ?? 0) + stock,
        nombre: bib.Nombre || '',
        bloquea: previo ? previo.bloquea && bloquea : bloquea,
      });
    }
  }

  const resultado = new Map<string, DisponibilidadProducto>();

  for (const receta of catalogo) {
    const idProducto = (receta.ID_Producto || '').trim();
    const clave = normalizarNombre(receta.Ingrediente);
    if (!idProducto || !clave) continue;

    const info = stockPorIngrediente.get(clave);
    if (!info || !info.bloquea) continue; // sin inventario o es empaque

    const porUnidad = (parseFloat(receta.Cantidad_Receta) || 0) * factorMerma(receta.Merma_Pct);
    if (porUnidad <= 0) continue; // receta sin cantidad: no limita

    const posibles = Math.floor(info.stock / porUnidad);
    const actual = resultado.get(idProducto);

    if (!actual || actual.disponibles === null || posibles < actual.disponibles) {
      resultado.set(idProducto, { disponibles: posibles, limitadoPor: info.nombre });
    }
  }

  return resultado;
}

// El texto del aviso vive en disponibilidadCliente.ts para que la tienda
// pueda importarlo sin arrastrar googleapis al navegador.
export { avisoDisponibilidad } from './disponibilidadCliente';
