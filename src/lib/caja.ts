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

import {
  appendRow,
  ensureColumn,
  ensureSheet,
  getSheetData,
  updateCell,
  updateCells,
} from './googleSheets';
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
  /** Efectivo que se sacó de la caja para gastos */
  salidas: number;
  /** Efectivo que se metió a la caja sin ser venta */
  entradas: number;
  /** fondo + ventas + entradas − salidas */
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
  ventasEfectivo: number,
  movimientos: MovimientoCaja[] = []
): EstadoCaja {
  const salidas = movimientos
    .filter((m) => m.tipo === 'Salida')
    .reduce((s, m) => s + m.monto, 0);
  const entradas = movimientos
    .filter((m) => m.tipo === 'Entrada')
    .reduce((s, m) => s + m.monto, 0);
  const fondo = fila && fila.Fondo_Apertura !== '' ? parseFloat(fila.Fondo_Apertura) : null;
  const contado = fila && fila.Efectivo_Contado !== '' ? parseFloat(fila.Efectivo_Contado) : null;
  const abierta = fondo !== null;
  // El dinero que salió para comprar no es un faltante: se descuenta de
  // lo que debería haber, para que el conteo cuadre de verdad.
  const esperado = abierta
    ? Math.round((fondo! + ventasEfectivo + entradas - salidas) * 100) / 100
    : null;
  return {
    fecha,
    abierta,
    fondoApertura: fondo,
    horaApertura: fila?.Hora_Apertura || '',
    ventasEfectivo: Math.round(ventasEfectivo * 100) / 100,
    salidas: Math.round(salidas * 100) / 100,
    entradas: Math.round(entradas * 100) / 100,
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
  const [filas, ventas, movimientos] = await Promise.all([
    getSheetData(HOJA),
    ventasEfectivoDelDia(fechaISO),
    leerMovimientos(fechaISO),
  ]);
  return filaAEstado(
    filas.find((f) => f.Fecha === fechaISO),
    fechaISO,
    ventas,
    movimientos
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

/* ── Movimientos de efectivo ──────────────────────────────────────────
 *
 * Todo el efectivo que entra o sale de la caja SIN ser una venta: sacar
 * $200 para comprar limones, meter un cambio de la bolsa, pagarle a un
 * proveedor que llegó por su dinero.
 *
 * Sin esto, el corte no podía cuadrar: la caja tenía menos de lo esperado
 * y aparecía como faltante, cuando en realidad ese dinero se había ido en
 * una compra. Confundir un gasto con un faltante hace desconfiar del
 * corte y, a la larga, dejar de hacerlo.
 */

export const HOJA_MOV = 'Movimientos_Caja';
const COLS_MOV = ['Fecha', 'Hora', 'Tipo', 'Monto', 'Motivo', 'Quien', 'Cuenta'];

/**
 * Dónde vive el dinero. Son dos bolsas distintas y no se mezclan: el
 * cajón se cuenta a mano cada noche, y la cuenta de Mercado Pago se
 * compara contra lo que dice la app del banco.
 */
export const CUENTA_EFECTIVO = 'Efectivo';
export const CUENTA_DIGITAL = 'Digital';

/** Vacío se lee como efectivo: así los movimientos de antes siguen valiendo. */
const cuentaDe = (valor: string | undefined) =>
  (valor ?? '').toString().trim() === CUENTA_DIGITAL ? CUENTA_DIGITAL : CUENTA_EFECTIVO;

/** 'Rendimiento' solo aplica a la cuenta: es lo que paga el banco por tener el dinero ahí. */
export type TipoMovimiento = 'Salida' | 'Entrada' | 'Rendimiento';

export interface MovimientoCaja {
  fila: number;
  fecha: string;
  hora: string;
  tipo: TipoMovimiento;
  monto: number;
  motivo: string;
  quien: string;
  cuenta: string;
}

async function prepararMovimientos() {
  await ensureSheet(HOJA_MOV, COLS_MOV);
  // ensureSheet solo escribe encabezados al CREAR la hoja. Sin esto, la
  // columna nueva se llenaría en la celda pero getSheetData no la
  // devolvería, y todos los movimientos parecerían de efectivo.
  await ensureColumn(HOJA_MOV, 'Cuenta');
}

const leerTipo = (v: string | undefined): TipoMovimiento =>
  v === 'Entrada' ? 'Entrada' : v === 'Rendimiento' ? 'Rendimiento' : 'Salida';

/**
 * La fecha, venga como venga.
 *
 * Al escribir "2026-08-18", Google Sheets lo reconoce como fecha y guarda
 * un numero de serie; al releer en crudo vuelve "46252" y la comparacion
 * con la fecha de hoy no casaba nunca. Se normalizan las dos formas para
 * que sirva con lo ya guardado y con lo que se guarde despues.
 */
function fechaDeCelda(valor: string): string {
  const texto = (valor || '').toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (/^\d+(\.\d+)?$/.test(texto)) {
    // Serie de Sheets: dias desde el 30/12/1899
    const ms = Date.UTC(1899, 11, 30) + parseFloat(texto) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return texto;
}

const mapear = (f: Record<string, string>, fila: number): MovimientoCaja => ({
  fila,
  fecha: fechaDeCelda(f.Fecha),
  hora: f.Hora || '',
  tipo: leerTipo(f.Tipo),
  monto: Math.abs(parseFloat(f.Monto) || 0),
  motivo: f.Motivo || '',
  quien: f.Quien || '',
  cuenta: cuentaDe(f.Cuenta),
});

/** Movimientos de un día, del más reciente al más viejo. */
export async function leerMovimientos(
  fechaISO = fechaHoyMTY(),
  cuenta = CUENTA_EFECTIVO
): Promise<MovimientoCaja[]> {
  await prepararMovimientos();
  const filas = await getSheetData(HOJA_MOV, { crudo: true });
  return filas
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => fechaDeCelda(f.Fecha) === fechaISO && f.Tipo && cuentaDe(f.Cuenta) === cuenta)
    .map(({ f, fila }) => mapear(f, fila))
    .reverse();
}

/**
 * Movimientos de un rango. La cuenta no se corta cada noche como el
 * cajón: lo que interesa es el mes, o desde tal día hasta tal día.
 */
export async function leerMovimientosRango(
  desde: string,
  hasta: string,
  cuenta?: string
): Promise<MovimientoCaja[]> {
  await prepararMovimientos();
  const filas = await getSheetData(HOJA_MOV, { crudo: true });
  return filas
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => {
      // Sin cuenta se devuelven las dos bolsas: la pantalla las muestra
      // juntas con su distintivo, y leer la hoja dos veces costaría el
      // doble por un dato que ya viene en la misma respuesta.
      if (!f.Tipo) return false;
      if (cuenta && cuentaDe(f.Cuenta) !== cuenta) return false;
      const d = fechaDeCelda(f.Fecha);
      return (!desde || d >= desde) && (!hasta || d <= hasta);
    })
    .map(({ f, fila }) => mapear(f, fila))
    .reverse();
}

/**
 * Anota que salió o entró dinero de la caja.
 *
 * El motivo es obligatorio: un movimiento sin explicación es exactamente
 * el descuadre que se está tratando de evitar.
 */
export async function registrarMovimiento(
  tipo: TipoMovimiento,
  monto: number,
  motivo: string,
  quien: string,
  fechaISO = fechaHoyMTY(),
  cuenta = CUENTA_EFECTIVO
): Promise<void> {
  await prepararMovimientos();
  await appendRow(HOJA_MOV, [
    fechaISO,
    ahoraHora(),
    tipo,
    Math.round(Math.abs(monto) * 100) / 100,
    motivo.trim(),
    quien,
    cuenta,
  ]);
}

/** Borra un movimiento mal capturado. Se vacía la fila para no correr las demás. */
export async function borrarMovimiento(fila: number): Promise<void> {
  await prepararMovimientos();
  const vacias: Record<number, string> = {};
  for (let c = 1; c <= COLS_MOV.length; c++) vacias[c] = '';
  await updateCells(HOJA_MOV, fila, vacias);
}
