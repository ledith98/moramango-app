/**
 * stock.ts
 *
 * Movimiento automático de materia prima al ritmo de los pedidos.
 *
 * El stock se APARTA cuando entra el pedido, no cuando se marca listo.
 * Si se descontara al final, dos clientes podrían pagar la última concha
 * con minutos de diferencia y uno se quedaría sin nada — justo el mal
 * rato (y el reembolso) que esto busca evitar.
 *
 * Al cancelar se devuelve lo apartado.
 *
 * Nada de esto interrumpe el pedido: si el inventario falla, el error se
 * registra y la venta sigue su curso. Un pedido perdido cuesta más que un
 * conteo de insumos desfasado.
 */

import { ensureColumn, getSheetData, updateCell } from '@/lib/googleSheets';
import { factorDeTamano } from './tamanoFactor';
import { parsearTamanos } from './tamanos';
import { consumoPorInsumo } from '@/lib/insumos';
import { clavesDeInsumo, COL_ACT, estaEnUso, HOJA_ACTIVOS, HOJA_BIBLIOTECA } from '@/lib/inventario';
import { leerRecetas } from '@/lib/recetario';

type Direccion = 'apartar' | 'devolver';

/**
 * Ajusta las Existencias por producto (los de reventa, que llevan un
 * conteo directo de piezas en la hoja Productos). Los elaborados dejan la
 * columna vacía y no se tocan.
 */
async function moverExistenciasDeProducto(
  itemsPedido: Record<string, string>[],
  signo: number
): Promise<void> {
  try {
    const productos = await getSheetData('Productos', { crudo: true });
    const conControl = productos.some((p) => (p.Existencias ?? '').toString().trim() !== '');
    if (!conControl) return; // nadie lleva existencias: nada que hacer

    const colExistencias = await ensureColumn('Productos', 'Existencias');

    // Cuánto se vendió de cada producto en este pedido
    const vendido = new Map<string, number>();
    for (const it of itemsPedido) {
      if (!it.ID_Producto) continue;
      vendido.set(it.ID_Producto, (vendido.get(it.ID_Producto) || 0) + (parseInt(it.Cantidad) || 1));
    }

    for (const [idProducto, cantidad] of vendido) {
      const idx = productos.findIndex((p) => p.ID_Producto === idProducto);
      if (idx === -1) continue;
      const actual = (productos[idx].Existencias ?? '').toString().trim();
      if (actual === '') continue; // producto sin control de existencias

      const nuevo = Math.max(0, (parseFloat(actual) || 0) + signo * cantidad);
      await updateCell('Productos', idx + 2, colExistencias, nuevo);
    }
  } catch (error) {
    console.error('Error al ajustar existencias de producto:', error);
  }
}

/**
 * Ajusta el stock de todos los insumos que consume un pedido.
 *
 * @param idPedido  pedido cuyas líneas se leen de 'DT PEDIDOS'
 * @param direccion 'apartar' resta del stock, 'devolver' lo reintegra
 */
export async function moverStockDePedido(
  idPedido: string,
  direccion: Direccion
): Promise<void> {
  try {
    const detalles = await getSheetData('DT PEDIDOS');
    const itemsPedido = detalles.filter((d) => d.ID_Pedido === idPedido);
    if (itemsPedido.length === 0) return;

    const signo = direccion === 'apartar' ? -1 : 1;

    // 1) Existencias por producto (reventa) — corre siempre, aunque el
    //    producto no tenga receta de insumos.
    await moverExistenciasDeProducto(itemsPedido, signo);

    // 2) Insumos por receta (elaborados)
    const [catalogo, biblioteca, activos, productos] = await Promise.all([
      leerRecetas(),
      getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
      getSheetData(HOJA_ACTIVOS, { crudo: true }),
      getSheetData('Productos', { crudo: true }),
    ]);

    // Tamaños de cada producto, para saber cuántas porciones vale lo que
    // se vendió: la receta está escrita para el tamaño más chico.
    const tamanosPorProducto = new Map(
      productos.map((p) => [p.ID_Producto, parsearTamanos(p.Tamanos ?? '')])
    );

    const consumo = consumoPorInsumo(
      itemsPedido.map((i) => ({
        idProducto: i.ID_Producto,
        cantidad: parseInt(i.Cantidad) || 1,
        factor: factorDeTamano(tamanosPorProducto.get(i.ID_Producto) ?? [], i.Tamano ?? ''),
      })),
      catalogo
    );
    if (consumo.size === 0) return;

    // Cada insumo declara qué ingredientes de las recetas cubre (o se une
    // por nombre si no hay vínculo manual). El stock vive en el insumo
    // activo (relación 1:1) y siempre en unidad de receta.
    for (const [clave, cantidad] of consumo) {
      const bib = biblioteca.find((b) => clavesDeInsumo(b).includes(clave));
      if (!bib) continue;

      const idx = activos.findIndex((a) => a.ID_Biblioteca === bib.ID_Biblioteca);
      if (idx === -1) continue;
      if (!estaEnUso(activos[idx].En_Uso)) continue; // guardado solo en biblioteca

      const stockActual = parseFloat(activos[idx].Stock_Actual) || 0;
      const nuevoStock = Math.max(0, stockActual + signo * cantidad);

      // Fila = índice en datos + 2 (la fila 1 son encabezados)
      await updateCell(HOJA_ACTIVOS, idx + 2, COL_ACT.stock, Math.round(nuevoStock * 1000) / 1000);
    }
  } catch (error) {
    console.error(`Error al ${direccion} stock del pedido ${idPedido}:`, error);
  }
}
