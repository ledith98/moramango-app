/**
 * comision.ts
 *
 * Lo que cobra la terminal por cada cobro con tarjeta.
 *
 * Tarifa: 3.49% del monto + $4 fijos, y sobre esa suma se paga IVA.
 *
 * El cargo fijo es POR COBRO, no por día: cobrar $500 en una venta no
 * cuesta lo mismo que cobrarlos en cinco de $100 (un cargo de $4 contra
 * cinco). Por eso la comisión se calcula venta por venta y luego se suma,
 * nunca sobre el total del periodo.
 */

/** 3.49% del monto cobrado */
export const PORCENTAJE = 0.0349;
/** Cargo fijo por cada cobro */
export const CARGO_FIJO = 4;
/** IVA que se paga sobre la comisión */
export const IVA = 0.16;

/** Métodos de pago a los que la terminal les cobra comisión. */
export const METODOS_CON_COMISION = ['Terminal'];

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Comisión de UN cobro con terminal, IVA incluido.
 *
 * Una venta de $0 (o negativa, si algo salió mal) no cuesta comisión: sin
 * esto, el cargo fijo la dejaría en números rojos.
 */
export function comisionDeVenta(monto: number): number {
  if (!isFinite(monto) || monto <= 0) return 0;
  return redondear((monto * PORCENTAJE + CARGO_FIJO) * (1 + IVA));
}

export interface ResumenComision {
  /** Lo que se cobró con terminal, antes de comisión */
  ventaBruta: number;
  comision: number;
  /** Lo que de verdad llega a la cuenta */
  neto: number;
  cobros: number;
}

/** Suma la comisión de varios cobros, uno por uno. */
export function resumenComision(montos: number[]): ResumenComision {
  const validos = montos.filter((m) => isFinite(m) && m > 0);
  const ventaBruta = redondear(validos.reduce((s, m) => s + m, 0));
  const comision = redondear(validos.reduce((s, m) => s + comisionDeVenta(m), 0));
  return {
    ventaBruta,
    comision,
    neto: redondear(ventaBruta - comision),
    cobros: validos.length,
  };
}

/** "3.49% + $4 + IVA" — para explicarlo en pantalla sin repetir números. */
export const TEXTO_TARIFA = `${(PORCENTAJE * 100).toFixed(2)}% + $${CARGO_FIJO} + IVA`;
