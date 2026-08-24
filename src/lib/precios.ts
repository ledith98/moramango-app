/**
 * precios.ts
 *
 * La línea de tiempo de un precio: armarla y leerla.
 *
 * Va aparte de `historialPrecios.ts` porque aquí no se toca Google. Todo
 * lo que importa `googleSheets` arrastra `googleapis`, que pide módulos de
 * Node ('child_process', 'fs') y revienta al construir una pantalla. Con
 * la parte pura separada, el panel puede usar estos tipos y estas cuentas
 * sin arrastrar el servidor.
 */

export type OrigenPrecio = 'compra' | 'anotado' | 'revisado';

export interface RegistroPrecio {
  /** Vacío cuando viene de una compra: esas no se borran desde aquí */
  id: string;
  fecha: string;
  precio: number;
  contenido: number;
  /** Lo que costó la unidad de receta con ese precio */
  porUnidad: number;
  origen: OrigenPrecio;
  quien: string;
  /** Fila de Compras_Insumos, para poder mandar a corregirla allá */
  filaCompra?: number;
}

/** Sheets interpreta el texto según el idioma del archivo; el número no. */
export const comoNumero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

/**
 * El historial completo: anotaciones y compras, en una sola línea de tiempo.
 *
 * Las compras se leen de Compras_Insumos y se marcan como tales para que
 * la pantalla no ofrezca borrarlas ahí — borrar una compra mueve el stock
 * y lo gastado, y eso se hace donde se capturó.
 *
 * @param compras filas crudas de Compras_Insumos, ya leídas por quien llama
 * @param fechaDeCelda cómo normalizar la fecha (se inyecta para no
 *        arrastrar dependencias: la misma función sirve en los dos lados)
 */
export function armarHistorial(
  anotaciones: RegistroPrecio[],
  compras: Record<string, string>[],
  idPresentacion: string,
  idBiblioteca: string,
  idProveedor: string,
  fechaDeCelda: (valor: string | undefined) => string
): RegistroPrecio[] {
  const deCompras: RegistroPrecio[] = compras
    .map((c, i) => ({ c, fila: i + 2 }))
    .filter(({ c }) => {
      if (!c.ID_Biblioteca) return false;
      // Si la compra dice de qué presentación fue, esa manda
      const pres = (c.ID_Presentacion || '').toString().trim();
      if (pres) return pres === idPresentacion;
      // Compras viejas sin presentación: valen si son del mismo insumo y
      // del mismo proveedor, que es lo que esta pantalla está mostrando
      return (
        c.ID_Biblioteca === idBiblioteca &&
        !!idProveedor &&
        (c.ID_Proveedor || '').toString().trim() === idProveedor
      );
    })
    .map(({ c, fila }) => {
      const precio = comoNumero(c.Precio_Unidad_Compra);
      const contenido = comoNumero(c.Equivalencia);
      return {
        id: '',
        fecha: fechaDeCelda(c.Fecha),
        precio,
        contenido,
        porUnidad: comoNumero(c.Costo_Unidad_Receta) || (contenido > 0 ? precio / contenido : 0),
        origen: 'compra' as OrigenPrecio,
        quien: (c.Quien || '').toString().trim(),
        filaCompra: fila,
      };
    });

  return [...anotaciones, ...deCompras]
    .filter((r) => r.precio > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

/** El más reciente de todo el historial: el precio que hoy vale. */
export function vigente(historial: RegistroPrecio[]): RegistroPrecio | null {
  return historial.length > 0 ? historial[0] : null;
}
