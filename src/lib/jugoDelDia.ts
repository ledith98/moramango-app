/**
 * jugoDelDia.ts
 *
 * "Jugo del día": un solo dato que la dueña fija cada mañana y que se usa
 * en tres lados — el banner de la tienda, el aviso de Telegram y la
 * imagen para redes. Una fuente, tres usos.
 *
 * Guarda la fecha junto al jugo a propósito: si hoy nadie lo fijó, NO se
 * muestra el de ayer. El banner solo aparece cuando el dato es de hoy.
 */

import { appendRow, ensureSheet, getSheetData, updateCell } from './googleSheets';
import { fechaHoyMTY } from './pedidoFecha';

const HOJA = 'Ajustes_Tienda';
const COLS = ['Clave', 'Valor', 'Nota', 'Fecha'];
const CLAVE = 'JugoDelDia';

export interface JugoDelDia {
  jugo: string;
  nota: string;
  /** YYYY-MM-DD en que se fijó */
  fecha: string;
  /** true solo si se fijó HOY; el banner depende de esto */
  vigente: boolean;
}

async function preparar() {
  await ensureSheet(HOJA, COLS);
}

export async function leerJugoDelDia(): Promise<JugoDelDia | null> {
  await preparar();
  const filas = await getSheetData(HOJA);
  const fila = filas.find((f) => f.Clave === CLAVE);
  if (!fila || !(fila.Valor || '').trim()) return null;
  const fecha = (fila.Fecha || '').trim();
  return {
    jugo: fila.Valor.trim(),
    nota: (fila.Nota || '').trim(),
    fecha,
    vigente: fecha === fechaHoyMTY(),
  };
}

/** Crea o actualiza el jugo del día, siempre con la fecha de hoy. */
export async function guardarJugoDelDia(jugo: string, nota: string): Promise<void> {
  await preparar();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Clave === CLAVE);
  const valores = [CLAVE, jugo.trim(), nota.trim(), fechaHoyMTY()];

  if (idx === -1) {
    await appendRow(HOJA, valores);
    return;
  }
  const fila = idx + 2; // +1 encabezado, +1 base 1
  await updateCell(HOJA, fila, 2, jugo.trim());
  await updateCell(HOJA, fila, 3, nota.trim());
  await updateCell(HOJA, fila, 4, fechaHoyMTY());
}

/** Quita el jugo del día (deja de mostrarse el banner). */
export async function limpiarJugoDelDia(): Promise<void> {
  await preparar();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Clave === CLAVE);
  if (idx === -1) return;
  const fila = idx + 2;
  await updateCell(HOJA, fila, 2, '');
  await updateCell(HOJA, fila, 3, '');
}
