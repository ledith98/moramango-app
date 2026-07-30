/**
 * ajustes.ts
 *
 * Ajustes del negocio que la dueña puede cambiar desde el panel, sin
 * tocar código. Viven en una hoja clave-valor (`Ajustes_Tienda`) para que
 * también se puedan revisar o corregir desde Google Sheets.
 *
 * Cada ajuste declara su valor por omisión, así que si la hoja está vacía
 * o alguien borra una fila, el negocio sigue funcionando igual que antes.
 */

import { appendRow, ensureSheet, getSheetData, updateCell } from './googleSheets';

const HOJA = 'Ajustes_Tienda';
const COLS = ['Clave', 'Valor', 'Nota', 'Fecha'];

/** Tope de precio del artículo gratis de la décima compra. */
export const CLAVE_TOPE_ARTICULO = 'TopeArticuloGratis';
export const TOPE_ARTICULO_DEFAULT = 35;

/**
 * En qué orden se ven los grupos de alimentos en la tienda.
 *
 * Se guarda con "|" y no con coma porque una categoría podría llevar coma
 * en el nombre y partiría la lista en dos.
 */
export const CLAVE_ORDEN_CATEGORIAS = 'OrdenCategorias';
export const ORDEN_CATEGORIAS_DEFAULT = [
  'Combos',
  'Comida salada',
  'Jugos',
  'Licuados',
  'Comida dulce',
  'Bebidas',
];
const SEPARADOR = '|';

export interface Ajustes {
  topeArticuloGratis: number;
  ordenCategorias: string[];
}

/** Para comparar categorías sin que estorben acentos, mayúsculas o espacios. */
export function claveCategoria(nombre: string): string {
  return (nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Posición de una categoría según el orden guardado. Las que no estén en la
 * lista (una nueva que se acabe de crear) se van al final, no desaparecen.
 */
export function posicionCategoria(categoria: string, orden: string[]): number {
  const i = orden.findIndex((c) => claveCategoria(c) === claveCategoria(categoria));
  return i === -1 ? orden.length : i;
}

async function preparar() {
  await ensureSheet(HOJA, COLS);
}

export async function leerAjustes(): Promise<Ajustes> {
  try {
    await preparar();
    const filas = await getSheetData(HOJA, { crudo: true });
    const valor = filas.find((f) => f.Clave === CLAVE_TOPE_ARTICULO)?.Valor;
    const tope = parseFloat((valor ?? '').toString());

    const crudo = (filas.find((f) => f.Clave === CLAVE_ORDEN_CATEGORIAS)?.Valor ?? '').toString();
    const orden = crudo
      .split(SEPARADOR)
      .map((c) => c.trim())
      .filter(Boolean);

    return {
      topeArticuloGratis: !isNaN(tope) && tope > 0 ? tope : TOPE_ARTICULO_DEFAULT,
      ordenCategorias: orden.length > 0 ? orden : ORDEN_CATEGORIAS_DEFAULT,
    };
  } catch {
    // Si la hoja falla, el negocio sigue con los valores de siempre
    return {
      topeArticuloGratis: TOPE_ARTICULO_DEFAULT,
      ordenCategorias: ORDEN_CATEGORIAS_DEFAULT,
    };
  }
}

/** Guarda el orden en que se ven los grupos en la tienda. */
export async function guardarOrdenCategorias(orden: string[]): Promise<void> {
  const limpio = orden.map((c) => c.trim()).filter(Boolean);
  await guardarAjuste(
    CLAVE_ORDEN_CATEGORIAS,
    limpio.join(SEPARADOR),
    'Orden de los grupos de alimentos en la tienda'
  );
}

/** Guarda (o crea) un ajuste por su clave. */
export async function guardarAjuste(clave: string, valor: string | number, nota = ''): Promise<void> {
  await preparar();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Clave === clave);
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  if (idx === -1) {
    await appendRow(HOJA, [clave, valor, nota, fecha]);
    return;
  }
  const fila = idx + 2; // +1 encabezado, +1 base 1
  await updateCell(HOJA, fila, 2, valor);
  if (nota) await updateCell(HOJA, fila, 3, nota);
  await updateCell(HOJA, fila, 4, fecha);
}
