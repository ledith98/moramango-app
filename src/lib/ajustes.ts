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

export interface Ajustes {
  topeArticuloGratis: number;
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
    return {
      topeArticuloGratis: !isNaN(tope) && tope > 0 ? tope : TOPE_ARTICULO_DEFAULT,
    };
  } catch {
    // Si la hoja falla, el negocio sigue con los valores de siempre
    return { topeArticuloGratis: TOPE_ARTICULO_DEFAULT };
  }
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
