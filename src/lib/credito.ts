/**
 * credito.ts
 *
 * La línea de crédito del local.
 *
 * Es una tarjeta de uso EXCLUSIVO de Moramango: se paga con ella lo del
 * local —insumos, servicios— y nada personal. Esa regla es la razón de
 * que esto exista aparte y no como una salida más de la cuenta: mezclar
 * los gastos del local con los de la casa en un solo saldo hace imposible
 * saber cuánto cuesta de verdad el negocio.
 *
 * Lo que hay que poder contestar, y que nada más contestaba:
 *
 *   ¿Cuánto me queda disponible?
 *   ¿Cuánto tengo que pagar, y para cuándo?
 *
 * La segunda es la que duele si se falla, y no es "el saldo": una tarjeta
 * se paga por periodos. Lo que se debe pagar antes de la fecha límite es
 * lo que se gastó hasta el corte, menos lo que ya se abonó desde
 * entonces. Lo comprado después del corte se paga hasta el mes que sigue.
 *
 * Un cargo NO sale del banco el día que se hace, así que esto no toca el
 * saldo de Mercado Pago. El dinero sale cuando se anota el pago, y ese sí
 * se registra aparte como salida de la cuenta.
 */

import { appendRow, ensureSheet, getSheetData, updateCells } from './googleSheets';
import { siguienteId } from './ids';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';

export const HOJA_CREDITO = 'Credito';

const COLS = [
  'ID_Movimiento',
  'Fecha',
  // 'Cargo' = se compró con la tarjeta · 'Pago' = se le abonó
  'Tipo',
  'Concepto',
  'Monto',
  // En qué se fue, para saber si la línea se está yendo en insumos o en servicios
  'Categoria',
  'Quien',
  'Notas',
];

/** Columnas 1-based, para updateCells */
const COL = { fecha: 2, tipo: 3, concepto: 4, monto: 5, categoria: 6, notas: 8 } as const;

export const TIPOS = ['Cargo', 'Pago'] as const;
export type TipoMovimiento = (typeof TIPOS)[number];

/**
 * En qué se puede gastar la línea.
 *
 * La lista es corta y cerrada a propósito: con texto libre acaban
 * existiendo "Insumos", "insumo" y "INSUMOS" y ya no se puede sumar por
 * categoría. "Otro" está para lo que no cae en las dos primeras, no para
 * gastos personales — esos no van en esta tarjeta.
 */
export const CATEGORIAS = ['Insumos', 'Servicios', 'Otro'] as const;
export type CategoriaCredito = (typeof CATEGORIAS)[number];

/** Clave del ajuste y su valor por omisión. */
export const CLAVE_LIMITE = 'CreditoLimite';
export const LIMITE_DEFAULT = 18300;
export const CLAVE_DIA_CORTE = 'CreditoDiaCorte';
export const CLAVE_DIA_PAGO = 'CreditoDiaPago';

export interface MovimientoCredito {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  concepto: string;
  monto: number;
  categoria: string;
  quien: string;
  notas: string;
}

export interface EstadoCredito {
  limite: number;
  /** Lo que se debe hoy: todos los cargos menos todos los pagos */
  usado: number;
  disponible: number;
  /** Qué tanto de la línea se lleva gastado, para el semáforo */
  porcentajeUsado: number;
  /** Días del mes; 0 = todavía sin configurar */
  diaCorte: number;
  diaPago: number;
  /** El corte más reciente que ya pasó, o '' si no hay días configurados */
  ultimoCorte: string;
  /** Cuándo se vence lo de ese corte */
  fechaLimite: string;
  /** Cuánto hay que pagar antes de fechaLimite */
  porPagar: number;
  /** Días que faltan; negativo = ya se venció */
  diasParaPagar: number | null;
  /** Lo gastado después del corte, que se paga hasta el periodo que sigue */
  delSiguientePeriodo: number;
  gastadoPorCategoria: { categoria: string; monto: number }[];
  movimientos: MovimientoCredito[];
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Sheets guarda números; el texto llega según el idioma de la hoja. */
const comoNumero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export async function prepararCredito(): Promise<void> {
  await ensureSheet(HOJA_CREDITO, COLS);
}

/**
 * Suma o resta días a una fecha YYYY-MM-DD sin pasar por Date().
 *
 * Date() interpreta "2026-08-28" como UTC y en Monterrey eso es el 27 a
 * las 6 de la tarde: las fechas se recorren un día. Aquí solo se compara
 * y se arma texto, así que se hace a mano.
 */
function armarFecha(anio: number, mes: number, dia: number): string {
  // Un día 31 en un mes de 30 se pega al último real: la tarjeta que
  // corta el 31 corta el 28 en febrero, no el 3 de marzo.
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const d = Math.min(dia, ultimo);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Diferencia en días entre dos YYYY-MM-DD, sin líos de zona horaria. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * El último corte que ya pasó y cuándo se vence.
 *
 * El día de pago suele caer en el mes siguiente al corte (corta el 15,
 * se paga el 5). Se detecta solo: si el día de pago es menor o igual al
 * de corte, es del mes que sigue.
 */
export function periodoDeCorte(
  diaCorte: number,
  diaPago: number,
  hoy: string
): { ultimoCorte: string; fechaLimite: string } {
  if (!diaCorte || !diaPago) return { ultimoCorte: '', fechaLimite: '' };

  const anio = +hoy.slice(0, 4);
  const mes = +hoy.slice(5, 7);
  const dia = +hoy.slice(8, 10);

  // Si todavía no llega el corte de este mes, el último fue el del pasado
  const corteEsteMes = armarFecha(anio, mes, diaCorte);
  const { a, m } =
    dia > +corteEsteMes.slice(8, 10)
      ? { a: anio, m: mes }
      : mes === 1
        ? { a: anio - 1, m: 12 }
        : { a: anio, m: mes - 1 };

  const ultimoCorte = armarFecha(a, m, diaCorte);
  const pagoSiguienteMes = diaPago <= diaCorte;
  const ap = pagoSiguienteMes && m === 12 ? a + 1 : a;
  const mp = pagoSiguienteMes ? (m === 12 ? 1 : m + 1) : m;

  return { ultimoCorte, fechaLimite: armarFecha(ap, mp, diaPago) };
}

/** Los movimientos, del más reciente al más viejo. */
export async function leerMovimientos(): Promise<MovimientoCredito[]> {
  try {
    const filas = await getSheetData(HOJA_CREDITO, { crudo: true });
    return filas
      .filter((f) => f.ID_Movimiento && f.Fecha)
      .map((f) => ({
        id: (f.ID_Movimiento || '').toString().trim(),
        fecha: fechaDeCelda(f.Fecha),
        tipo: ((f.Tipo || '').toString().trim() === 'Pago' ? 'Pago' : 'Cargo') as TipoMovimiento,
        concepto: (f.Concepto || '').toString().trim(),
        monto: redondear(comoNumero(f.Monto)),
        categoria: (f.Categoria || '').toString().trim(),
        quien: (f.Quien || '').toString().trim(),
        notas: (f.Notas || '').toString().trim(),
      }))
      .filter((m) => m.fecha && m.monto > 0)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.id < b.id ? 1 : -1));
  } catch {
    // Todavía sin hoja: se crea sola con el primer movimiento
    return [];
  }
}

/** Cómo va la tarjeta: cuánto queda y cuánto hay que pagar. */
export function calcularEstado(
  movimientos: MovimientoCredito[],
  limite: number,
  diaCorte: number,
  diaPago: number,
  hoy = fechaHoyMTY()
): EstadoCredito {
  const cargos = movimientos.filter((m) => m.tipo === 'Cargo');
  const pagos = movimientos.filter((m) => m.tipo === 'Pago');
  const suma = (xs: MovimientoCredito[]) => redondear(xs.reduce((s, m) => s + m.monto, 0));

  const usado = redondear(suma(cargos) - suma(pagos));
  const { ultimoCorte, fechaLimite } = periodoDeCorte(diaCorte, diaPago, hoy);

  /*
    Lo que se debe pagar antes de la fecha límite es lo que había al
    corte, menos lo abonado desde entonces. Lo comprado después del corte
    NO entra: eso se paga hasta el periodo que sigue, y meterlo aquí haría
    ver una deuda más grande de la que hay que cubrir este mes.
  */
  let porPagar = 0;
  let delSiguientePeriodo = 0;
  if (ultimoCorte) {
    const alCorte = redondear(
      suma(cargos.filter((m) => m.fecha <= ultimoCorte)) -
        suma(pagos.filter((m) => m.fecha <= ultimoCorte))
    );
    const abonado = suma(pagos.filter((m) => m.fecha > ultimoCorte));
    porPagar = Math.max(0, redondear(alCorte - abonado));
    delSiguientePeriodo = suma(cargos.filter((m) => m.fecha > ultimoCorte));
  }

  const porCategoria = new Map<string, number>();
  for (const m of cargos) {
    const c = m.categoria || 'Otro';
    porCategoria.set(c, redondear((porCategoria.get(c) || 0) + m.monto));
  }

  return {
    limite,
    usado,
    disponible: redondear(limite - usado),
    porcentajeUsado: limite > 0 ? Math.round((usado / limite) * 1000) / 10 : 0,
    diaCorte,
    diaPago,
    ultimoCorte,
    fechaLimite,
    porPagar,
    diasParaPagar: fechaLimite ? diasEntre(hoy, fechaLimite) : null,
    delSiguientePeriodo,
    gastadoPorCategoria: [...porCategoria.entries()]
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto),
    movimientos,
  };
}

/** Anota un cargo o un pago. Devuelve el id que le tocó. */
export async function anotarMovimiento(datos: {
  fecha: string;
  tipo: TipoMovimiento;
  concepto: string;
  monto: number;
  categoria: string;
  quien: string;
  notas?: string;
}): Promise<string> {
  await prepararCredito();
  const filas = await getSheetData(HOJA_CREDITO, { crudo: true });
  const id = siguienteId(filas, 'ID_Movimiento', 'CRD', 4);
  await appendRow(HOJA_CREDITO, [
    id,
    datos.fecha || fechaHoyMTY(),
    datos.tipo,
    datos.concepto,
    // Número de verdad y no texto: la hoja está en español y "1234.50"
    // escrito como cadena se guarda como una fecha.
    redondear(datos.monto),
    datos.categoria,
    datos.quien,
    datos.notas ?? '',
  ]);
  return id;
}

/**
 * Borra un movimiento mal anotado.
 *
 * Se vacía la fila pero se conserva el ID, igual que con las
 * presentaciones: siguienteId toma la clave más alta que exista, y si se
 * borrara también la clave, el siguiente movimiento heredaría la del
 * muerto.
 */
export async function borrarMovimiento(id: string): Promise<boolean> {
  await prepararCredito();
  const filas = await getSheetData(HOJA_CREDITO, { crudo: true });
  const i = filas.findIndex((f) => (f.ID_Movimiento || '').toString().trim() === id);
  if (i === -1) return false;
  const vacias: Record<number, string> = {};
  for (let c = 2; c <= COLS.length; c++) vacias[c] = '';
  await updateCells(HOJA_CREDITO, i + 2, vacias);
  return true;
}

/** Corrige un movimiento ya anotado, sin moverle el id. */
export async function editarMovimiento(
  id: string,
  datos: {
    fecha: string;
    tipo: TipoMovimiento;
    concepto: string;
    monto: number;
    categoria: string;
    notas?: string;
  }
): Promise<boolean> {
  await prepararCredito();
  const filas = await getSheetData(HOJA_CREDITO, { crudo: true });
  const i = filas.findIndex((f) => (f.ID_Movimiento || '').toString().trim() === id);
  if (i === -1) return false;
  await updateCells(HOJA_CREDITO, i + 2, {
    [COL.fecha]: datos.fecha,
    [COL.tipo]: datos.tipo,
    [COL.concepto]: datos.concepto,
    [COL.monto]: redondear(datos.monto),
    [COL.categoria]: datos.categoria,
    [COL.notas]: datos.notas ?? '',
  });
  return true;
}
