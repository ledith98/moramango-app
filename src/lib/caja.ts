/**
 * caja.ts
 *
 * Corte de caja: una caja por día. Registra el fondo con el que se abre y
 * el efectivo contado al cerrar, para poder comparar contra lo que la app
 * dice que debería haber y detectar faltantes o sobrantes.
 *
 *   esperado = fondo de apertura + ventas en efectivo del día
 *   diferencia = contado − esperado   (negativo = falta, positivo = sobra)
 *
 * Las ventas en efectivo se calculan de PEDIDOS (método Efectivo, del día,
 * sin cancelar): así el corte no depende de que nadie las sume a mano.
 */

import { appendRow, ensureSheet, getSheetData, updateCell } from './googleSheets';
import { normalizarMetodoPago } from './negocio';
import { fechaHoyMTY, parsearFechaHora } from './pedidoFecha';

const HOJA = 'Caja';
const COLS = [
  'Fecha',
  'Fondo_Apertura',
  'Hora_Apertura',
  'Abrio',
  'Efectivo_Contado',
  'Hora_Corte',
  'Cerro',
  'Notas',
];
// Columnas 1-based para updateCell
const COL = {
  fondo: 2,
  horaApertura: 3,
  abrio: 4,
  contado: 5,
  horaCorte: 6,
  cerro: 7,
  notas: 8,
} as const;

export interface EstadoCaja {
  fecha: string;
  abierta: boolean;
  fondoApertura: number | null;
  horaApertura: string;
  ventasEfectivo: number;
  /** fondo + ventas en efectivo */
  esperado: number | null;
  cerrada: boolean;
  efectivoContado: number | null;
  horaCorte: string;
  /** contado − esperado; negativo = falta, positivo = sobra */
  diferencia: number | null;
  notas: string;
}

async function preparar() {
  await ensureSheet(HOJA, COLS);
}

/** Suma de ventas en efectivo del día (sin cancelar). */
async function ventasEfectivoDelDia(fechaISO: string): Promise<number> {
  const pedidos = await getSheetData('PEDIDOS', { crudo: true });
  return pedidos
    .filter((p) => p.Estado !== 'Cancelado')
    .filter((p) => normalizarMetodoPago(p.Metodo_Pago) === 'Efectivo')
    .filter((p) => parsearFechaHora(p.Fecha_Hora)?.fechaISO === fechaISO)
    .reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0);
}

function filaAEstado(
  fila: Record<string, string> | undefined,
  fecha: string,
  ventasEfectivo: number
): EstadoCaja {
  const fondo = fila && fila.Fondo_Apertura !== '' ? parseFloat(fila.Fondo_Apertura) : null;
  const contado = fila && fila.Efectivo_Contado !== '' ? parseFloat(fila.Efectivo_Contado) : null;
  const abierta = fondo !== null;
  const esperado = abierta ? Math.round((fondo! + ventasEfectivo) * 100) / 100 : null;
  return {
    fecha,
    abierta,
    fondoApertura: fondo,
    horaApertura: fila?.Hora_Apertura || '',
    ventasEfectivo: Math.round(ventasEfectivo * 100) / 100,
    esperado,
    cerrada: contado !== null,
    efectivoContado: contado,
    horaCorte: fila?.Hora_Corte || '',
    diferencia:
      contado !== null && esperado !== null ? Math.round((contado - esperado) * 100) / 100 : null,
    notas: fila?.Notas || '',
  };
}

export async function leerCaja(fechaISO = fechaHoyMTY()): Promise<EstadoCaja> {
  await preparar();
  const [filas, ventas] = await Promise.all([
    getSheetData(HOJA),
    ventasEfectivoDelDia(fechaISO),
  ]);
  return filaAEstado(
    filas.find((f) => f.Fecha === fechaISO),
    fechaISO,
    ventas
  );
}

const ahoraHora = () =>
  new Date().toLocaleTimeString('es-MX', {
    timeZone: 'America/Monterrey',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Abre la caja del día con su fondo. Idempotente: reabrir actualiza el fondo. */
export async function abrirCaja(fondo: number, quien: string): Promise<void> {
  await preparar();
  const fecha = fechaHoyMTY();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Fecha === fecha);
  const monto = Math.round(fondo * 100) / 100;

  if (idx === -1) {
    await appendRow(HOJA, [fecha, monto, ahoraHora(), quien, '', '', '', '']);
    return;
  }
  const fila = idx + 2;
  await updateCell(HOJA, fila, COL.fondo, monto);
  await updateCell(HOJA, fila, COL.horaApertura, ahoraHora());
  await updateCell(HOJA, fila, COL.abrio, quien);
}

/** Cierra la caja del día con el efectivo contado. */
export async function cerrarCaja(contado: number, quien: string, notas: string): Promise<EstadoCaja> {
  await preparar();
  const fecha = fechaHoyMTY();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Fecha === fecha);
  if (idx === -1) throw new Error('La caja de hoy no está abierta');

  const fila = idx + 2;
  await updateCell(HOJA, fila, COL.contado, Math.round(contado * 100) / 100);
  await updateCell(HOJA, fila, COL.horaCorte, ahoraHora());
  await updateCell(HOJA, fila, COL.cerro, quien);
  if (notas) await updateCell(HOJA, fila, COL.notas, notas.slice(0, 200));

  return leerCaja(fecha);
}
