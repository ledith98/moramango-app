/**
 * comision.ts
 *
 * Lo que se queda Mercado Pago por cada cobro que no es efectivo.
 *
 * Son DOS tarifas distintas, confirmadas contra los movimientos reales de
 * la cuenta del 11 al 19 de agosto de 2026 (los renglones "Liberación de
 * dinero", que ya llegan netos):
 *
 *   Terminal (Point)      3.50% + IVA, SIN cargo fijo  →  4.06% efectivo
 *   Pago en línea         3.49% + $4 + IVA
 *
 * Trece cobros cuadraron al centavo con estas dos fórmulas. Antes se le
 * aplicaba a la terminal la tarifa del pago en línea, y sobre $1,150
 * cobrados con tarjeta eso daba $97.60 de comisión cuando la real fue
 * $46.69: más del doble.
 *
 * El cargo fijo del pago en línea es POR COBRO, no por día: cobrar $500 en
 * una venta no cuesta lo mismo que en cinco de $100 (un cargo de $4 contra
 * cinco). Por eso se calcula venta por venta y luego se suma, nunca sobre
 * el total del periodo. Con la terminal da igual —al ser solo un
 * porcentaje, la suma es la misma— pero se hace igual, por uniformidad.
 */

/** IVA que se paga sobre la comisión */
export const IVA = 0.16;

export interface Tarifa {
  /** Porcentaje del monto cobrado */
  porcentaje: number;
  /** Cargo fijo por cada cobro */
  cargoFijo: number;
  /** Cómo se explica en pantalla */
  texto: string;
}

export const TARIFA_TERMINAL: Tarifa = {
  porcentaje: 0.035,
  cargoFijo: 0,
  texto: '3.50% + IVA',
};

export const TARIFA_EN_LINEA: Tarifa = {
  porcentaje: 0.0349,
  cargoFijo: 4,
  texto: '3.49% + $4 + IVA',
};

/** Métodos de pago que pagan comisión, con la tarifa que le toca a cada uno. */
export const TARIFA_POR_METODO: Record<string, Tarifa> = {
  Terminal: TARIFA_TERMINAL,
  'Pago en línea': TARIFA_EN_LINEA,
};

/** Métodos de pago a los que Mercado Pago les cobra comisión. */
export const METODOS_CON_COMISION = Object.keys(TARIFA_POR_METODO);

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Comisión de UN cobro, IVA incluido.
 *
 * Una venta de $0 (o negativa, si algo salió mal) no cuesta comisión: sin
 * esto, el cargo fijo del pago en línea la dejaría en números rojos.
 *
 * Un método desconocido paga 0: es preferible quedarse corto a inventarle
 * una comisión a un cobro en efectivo.
 */
export function comisionDeVenta(monto: number, metodo = 'Terminal'): number {
  if (!isFinite(monto) || monto <= 0) return 0;
  const tarifa = TARIFA_POR_METODO[metodo];
  if (!tarifa) return 0;
  return redondear((monto * tarifa.porcentaje + tarifa.cargoFijo) * (1 + IVA));
}

export interface ResumenComision {
  /** Lo que se cobró con ese método, antes de comisión */
  ventaBruta: number;
  comision: number;
  /** Lo que de verdad llega a la cuenta */
  neto: number;
  cobros: number;
}

/** Suma la comisión de varios cobros del MISMO método, uno por uno. */
export function resumenComision(montos: number[], metodo = 'Terminal'): ResumenComision {
  const validos = montos.filter((m) => isFinite(m) && m > 0);
  const ventaBruta = redondear(validos.reduce((s, m) => s + m, 0));
  const comision = redondear(validos.reduce((s, m) => s + comisionDeVenta(m, metodo), 0));
  return {
    ventaBruta,
    comision,
    neto: redondear(ventaBruta - comision),
    cobros: validos.length,
  };
}

/** Lo que de verdad cuesta cada método, en porcentaje, para comparar. */
export const porcentajeEfectivo = (t: Tarifa) => t.porcentaje * (1 + IVA);
