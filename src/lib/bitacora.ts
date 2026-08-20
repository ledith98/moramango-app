/**
 * bitacora.ts
 *
 * Quién cambió qué, y cuándo.
 *
 * Ocho personas distintas entran al panel con su propia cuenta. Cuando un
 * precio amanece cambiado, una receta no cuadra o falta existencia, hoy no
 * hay manera de saber si fue un error de captura, un cambio a propósito o
 * un accidente — ni a quién preguntarle.
 *
 * No es para vigilar a nadie: es para poder deshacer. Sin el registro, la
 * única forma de corregir es adivinar cómo estaba antes.
 *
 * Anotar cuesta un viaje a Google (~300 ms) sobre operaciones que ya
 * escriben. Por eso solo se anota lo que cambia datos, nunca las lecturas,
 * y `anotar` jamás tumba la operación: si falla la bitácora, el cambio
 * igual se guardó.
 */

import { appendRow, ensureSheet, getSheetData } from './googleSheets';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';

export const HOJA_BITACORA = 'Bitacora';
const COLS = ['Fecha', 'Hora', 'Quien', 'Area', 'Que', 'Detalle'];

/** Las áreas del panel, para poder filtrar la lista. */
export const AREAS = [
  'Productos',
  'Insumos',
  'Recetario',
  'Pedidos',
  'Caja',
  'Cuenta',
  'Ajustes',
  'Usuarios',
] as const;

export type Area = (typeof AREAS)[number];

export interface Movimiento {
  fecha: string;
  hora: string;
  quien: string;
  area: string;
  que: string;
  detalle: string;
}

const ahoraHora = () =>
  new Date().toLocaleTimeString('es-MX', {
    timeZone: 'America/Monterrey',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Anota un cambio.
 *
 * Nunca lanza: un fallo aquí no puede impedir que se guarde una venta o
 * una compra. Si la bitácora se cae, se pierde el registro, no el dato.
 */
export async function anotar(
  quien: string,
  area: Area,
  que: string,
  detalle = ''
): Promise<void> {
  try {
    await ensureSheet(HOJA_BITACORA, COLS);
    await appendRow(HOJA_BITACORA, [
      fechaHoyMTY(),
      ahoraHora(),
      (quien || '').trim() || 'sin identificar',
      area,
      que.trim().slice(0, 120),
      detalle.trim().slice(0, 500),
    ]);
  } catch (error) {
    console.error('No se pudo anotar en la bitácora:', error);
  }
}

/**
 * Describe un cambio de valor en una línea legible.
 *
 * "Precio: $50 → $55" dice más que "se editó el producto", que es lo que
 * se anotaría sin esto y no sirve para deshacer nada.
 */
export function cambios(antes: Record<string, unknown>, despues: Record<string, unknown>): string {
  const partes: string[] = [];
  for (const clave of Object.keys(despues)) {
    const a = (antes[clave] ?? '').toString().trim();
    const d = (despues[clave] ?? '').toString().trim();
    if (a === d) continue;
    partes.push(`${clave}: ${a || '(vacío)'} → ${d || '(vacío)'}`);
  }
  return partes.join(' · ');
}

/** Los últimos movimientos, del más reciente al más viejo. */
export async function leerBitacora(limite = 200): Promise<Movimiento[]> {
  try {
    const filas = await getSheetData(HOJA_BITACORA, { crudo: true });
    return filas
      .filter((f) => f.Fecha && f.Area)
      .map((f) => ({
        // Sheets convierte la fecha ISO en número de serie al guardarla
        fecha: fechaDeCelda(f.Fecha),
        hora: (f.Hora || '').toString(),
        quien: (f.Quien || '').toString(),
        area: (f.Area || '').toString(),
        que: (f.Que || '').toString(),
        detalle: (f.Detalle || '').toString(),
      }))
      .reverse()
      .slice(0, limite);
  } catch {
    // Todavía sin hoja: se crea sola con el primer cambio que se anote
    return [];
  }
}
