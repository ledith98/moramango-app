/**
 * saldos.ts
 *
 * El historial de cuánto ha habido en la cuenta.
 *
 * Antes, cada vez que se anotaba el saldo de Mercado Pago se pisaba el
 * anterior: quedaba una foto del día y nada más. Así no se puede
 * contestar «¿cuánto ha crecido la cuenta este mes?» ni ver si un día
 * bajó, que es justo cuando conviene mirar.
 *
 * Cada captura se guarda como un renglón nuevo. Dos del mismo día se
 * consideran correcciones y la última manda: capturar dos veces el mismo
 * día pasa cuando uno se equivoca al teclear, no porque el saldo haya
 * cambiado dos veces.
 */

import { appendRow, ensureSheet, getSheetData, updateCells } from './googleSheets';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';

export const HOJA_SALDOS = 'Saldos_Cuenta';
const COLS = ['Fecha', 'Saldo', 'Quien', 'Anotado'];
const COL = { saldo: 2, quien: 3, anotado: 4 } as const;

export interface SaldoAnotado {
  fecha: string;
  saldo: number;
  quien: string;
  /** Cuánto cambió contra la captura anterior; null en la primera */
  cambio: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Sheets interpreta el texto según el idioma del archivo; el número no. */
const comoNumero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export async function prepararSaldos(): Promise<void> {
  await ensureSheet(HOJA_SALDOS, COLS);
}

/**
 * Anota cuánto había en la cuenta ese día.
 *
 * Si ya había una captura de ese mismo día se corrige en su lugar, en vez
 * de dejar dos renglones peleando por la misma fecha.
 */
export async function anotarSaldo(
  saldo: number,
  fechaISO: string,
  quien: string
): Promise<void> {
  await prepararSaldos();
  const filas = await getSheetData(HOJA_SALDOS, { crudo: true });
  const fecha = fechaISO || fechaHoyMTY();
  const monto = redondear(saldo);
  // Cuándo se capturó, que puede no ser el día del saldo: si el domingo
  // anotas el saldo del viernes, la fecha del dato es el viernes.
  const anotado = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  const i = filas.findIndex((f) => fechaDeCelda(f.Fecha) === fecha);
  if (i === -1) {
    await appendRow(HOJA_SALDOS, [fecha, monto, quien, anotado]);
    return;
  }
  await updateCells(HOJA_SALDOS, i + 2, {
    [COL.saldo]: monto,
    [COL.quien]: quien,
    [COL.anotado]: anotado,
  });
}

/**
 * Las capturas, de la más reciente a la más vieja, con lo que cambió cada
 * una respecto a la anterior.
 *
 * El cambio se calcula aquí y no en la pantalla porque depende del orden:
 * hacerlo dos veces en dos lugares es garantizar que un día no coincidan.
 */
export async function leerSaldos(): Promise<SaldoAnotado[]> {
  try {
    const filas = await getSheetData(HOJA_SALDOS, { crudo: true });
    const limpias = filas
      .filter((f) => f.Fecha)
      .map((f) => ({
        fecha: fechaDeCelda(f.Fecha),
        saldo: comoNumero(f.Saldo),
        quien: (f.Quien || '').toString().trim(),
      }))
      .filter((f) => f.fecha)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

    // De viejo a nuevo para poder restar contra el anterior, y al final
    // se voltea: en pantalla lo primero que interesa es lo último.
    return limpias
      .map((f, i) => ({
        ...f,
        cambio: i === 0 ? null : redondear(f.saldo - limpias[i - 1].saldo),
      }))
      .reverse();
  } catch {
    // Todavía sin hoja: se crea sola con la primera captura
    return [];
  }
}
