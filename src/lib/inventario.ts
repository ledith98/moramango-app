/**
 * inventario.ts
 *
 * Esquema del inventario separado en dos entidades:
 *
 *  1. BibliotecaInsumo (catálogo base / "el cerebro")
 *     Define QUÉ es un insumo: cómo se compra (Caja, Litro), en qué
 *     unidad se usa en las recetas (ml, g) y la equivalencia entre ambas.
 *     Guarda el último precio de compra por unidad de compra.
 *
 *  2. InsumoActivo (operación diaria)
 *     Cuánto HAY de ese insumo: stock (siempre en unidad de receta),
 *     última compra, status y conteo físico. Relación 1:1 con la
 *     biblioteca vía ID_Biblioteca.
 *
 * Los campos calculados (costo por unidad de receta, consumo por día,
 * alcanza para X días) NO se almacenan: se calculan al leer, para que
 * nunca queden desincronizados con sus fuentes.
 *
 * Esta app usa Google Sheets como base de datos: cada "modelo" es una
 * pestaña y las columnas se crean solas con ensureSheet.
 */

import { ensureColumn, ensureSheet } from './googleSheets';

export const HOJA_BIBLIOTECA = 'Biblioteca_Insumos';
export const HOJA_ACTIVOS = 'Insumos_Activos';
export const HOJA_COMPRAS = 'Compras_Insumos';

/**
 * El orden de estos arreglos ES el orden de columnas en la hoja, y las
 * constantes COL_* de abajo dependen de él. Si agregas una columna,
 * hazlo AL FINAL y actualiza las constantes.
 */
export const COLS_BIBLIOTECA = [
  'ID_Biblioteca',
  'Nombre',
  'Unidad_Compra',
  'Unidad_Receta',
  'Equivalencia',
  'Ultimo_Precio_Compra',
  'Categoria',
  'Proveedor',
  'Contacto_Proveedor',
  'Eliminado',
];

export const COLS_ACTIVOS = [
  'ID_Activo',
  'ID_Biblioteca',
  'Stock_Actual',
  'Ultima_Compra',
  'Status',
  'Conteo_Fisico',
  'Fecha_Conteo',
  // 'no' = el insumo se conserva en la biblioteca pero no se usa hoy, así
  // que no aparece en la operación diaria. Vacío se lee como activo.
  'En_Uso',
];

export const COLS_COMPRAS = [
  'Fecha',
  'ID_Biblioteca',
  'Nombre',
  'Cantidad_Compra',
  'Unidad_Compra',
  'Precio_Total',
  'Precio_Unidad_Compra',
  'Equivalencia',
  'Costo_Unidad_Receta',
];

// Columnas 1-based para updateCell (coinciden con los arreglos de arriba)
export const COL_BIB = {
  nombre: 2,
  unidadCompra: 3,
  unidadReceta: 4,
  equivalencia: 5,
  ultimoPrecio: 6,
  categoria: 7,
  proveedor: 8,
  contacto: 9,
  eliminado: 10,
} as const;

export const COL_ACT = {
  stock: 3,
  ultimaCompra: 4,
  status: 5,
  conteoFisico: 6,
  fechaConteo: 7,
} as const;

export const STATUS_INSUMO = ['Fresco', 'Por caducar', 'Caducado'] as const;

/** Crea las tres pestañas si aún no existen (idempotente). */
export async function prepararInventario(): Promise<void> {
  await ensureSheet(HOJA_BIBLIOTECA, COLS_BIBLIOTECA);
  await ensureSheet(HOJA_ACTIVOS, COLS_ACTIVOS);
  await ensureSheet(HOJA_COMPRAS, COLS_COMPRAS);
  // ensureSheet solo escribe encabezados al crear la hoja; para una hoja
  // que ya existía, esto agrega la columna que falte.
  await ensureColumn(HOJA_ACTIVOS, 'En_Uso');
}

/**
 * Columna En_Uso resuelta por nombre (no por posición fija): la hoja pudo
 * haberse creado antes de que existiera esta columna.
 */
export const columnaEnUso = () => ensureColumn(HOJA_ACTIVOS, 'En_Uso');

/** Vacío = activo, para que los insumos creados antes sigan apareciendo. */
export const estaEnUso = (valor: string | undefined) =>
  (valor ?? '').toString().trim().toLowerCase() !== 'no';

export const redondear = (n: number, decimales = 2) => {
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
};

/**
 * Costo de una unidad de receta. Campo virtual:
 *   ultimoPrecioCompra (por 1 unidad de compra) / equivalencia
 * Ej: leche a $25 el litro, equivalencia 1000 → $0.025 por ml.
 */
export function costoPorUnidadReceta(ultimoPrecio: number, equivalencia: number): number | null {
  if (!ultimoPrecio || !equivalencia || equivalencia <= 0) return null;
  return redondear(ultimoPrecio / equivalencia, 4);
}

/** Convierte una cantidad comprada a unidades de receta. */
export function aUnidadesReceta(cantidadCompra: number, equivalencia: number): number {
  const eq = equivalencia > 0 ? equivalencia : 1;
  return redondear(cantidadCompra * eq, 3);
}
