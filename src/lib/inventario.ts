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
import { normalizarNombre } from './insumos';

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
  // Nombres de Catalogo.Ingrediente que consume este insumo, separados por
  // "|". Las recetas usan nombres genéricos ("Lechuga") y la biblioteca
  // nombres de compra ("Lechuga Italiana EVA"), así que el vínculo se
  // declara a mano. Vacío = se intenta unir por nombre idéntico.
  'Ingredientes',
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
  // Dónde se surtió. Opcional, texto libre: la lista de proveedores se
  // arma sola con lo que se va escribiendo, no hay catálogo que mantener.
  'Donde',
  // Quién la registró. Sale de la sesión, no se pregunta: ocho personas
  // entran al panel y sin esto no hay a quién preguntarle por una captura
  // rara.
  'Quien',
  // Proveedor del directorio. 'Donde' se conserva con el texto de siempre
  // para las compras viejas; el ID es el vínculo firme que permite
  // comparar precios sin que un nombre mal escrito parta el historial.
  'ID_Proveedor',
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
  ingredientes: 11,
} as const;

export const COL_ACT = {
  stock: 3,
  ultimaCompra: 4,
  status: 5,
  conteoFisico: 6,
  fechaConteo: 7,
} as const;

export const STATUS_INSUMO = ['Fresco', 'Por caducar', 'Caducado'] as const;

/**
 * Crea las tres pestañas si aún no existen (idempotente).
 *
 * Las hojas van primero y juntas; las columnas después, porque una columna
 * no se puede revisar en una hoja que todavía no existe. Antes las cinco
 * iban en fila y costaban ~1.2 s en cada carga y en cada guardado.
 */
export async function prepararInventario(): Promise<void> {
  await Promise.all([
    ensureSheet(HOJA_BIBLIOTECA, COLS_BIBLIOTECA),
    ensureSheet(HOJA_ACTIVOS, COLS_ACTIVOS),
    ensureSheet(HOJA_COMPRAS, COLS_COMPRAS),
  ]);
  // ensureSheet solo escribe encabezados al crear la hoja; para una hoja
  // que ya existía, esto agrega la columna que falte.
  await Promise.all([
    ensureColumn(HOJA_ACTIVOS, 'En_Uso'),
    ensureColumn(HOJA_BIBLIOTECA, 'Ingredientes'),
    // Varios proveedores por insumo, separados por '|': casi nada se le
    // compra siempre al mismo, y sin esto no se puede comparar.
    ensureColumn(HOJA_BIBLIOTECA, 'Proveedores'),
    ensureColumn(HOJA_COMPRAS, 'Donde'),
    ensureColumn(HOJA_COMPRAS, 'Quien'),
    ensureColumn(HOJA_COMPRAS, 'ID_Proveedor'),
  ]);
}

export const columnaIngredientes = () => ensureColumn(HOJA_BIBLIOTECA, 'Ingredientes');

const SEPARADOR = '|';

export const leerIngredientes = (valor: string | undefined): string[] =>
  (valor ?? '')
    .split(SEPARADOR)
    .map((s) => s.trim())
    .filter(Boolean);

export const escribirIngredientes = (lista: string[]): string =>
  [...new Set(lista.map((s) => s.trim()).filter(Boolean))].join(SEPARADOR);

/**
 * Nombres de ingrediente (normalizados) que consumen de este insumo.
 * Si no hay vínculo manual, se cae al nombre del insumo, que es lo que
 * funciona cuando la receta y la compra se llaman igual.
 */
export function clavesDeInsumo(bib: Record<string, string>): string[] {
  const manuales = leerIngredientes(bib.Ingredientes).map(normalizarNombre);
  // Su propio nombre SIEMPRE cuenta, además de los vínculos manuales: el
  // Recetario referencia al insumo por su nombre real, así que excluirlo
  // rompería justo las recetas de los insumos ya vinculados a mano.
  return [...new Set([normalizarNombre(bib.Nombre), ...manuales])].filter(Boolean);
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
