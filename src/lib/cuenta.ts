/**
 * cuenta.ts
 *
 * El dinero que NO está en el cajón: lo que entra por terminal, por pago
 * en línea y por transferencia, y vive en la cuenta de Mercado Pago.
 *
 * Va aparte del corte de caja porque se comporta distinto. El cajón se
 * cuenta a mano cada noche y se cierra; la cuenta es un saldo que corre y
 * lo que se compara es contra lo que dice la app del banco.
 *
 * Dos ideas que hay que tener separadas:
 *
 *   COBRADO    lo que le cobraste al cliente
 *   DISPONIBLE lo que de verdad queda en la cuenta, ya sin comisión
 *
 * Hoy la liberación es inmediata, así que ambas cosas pasan el mismo día
 * y la diferencia es solo la comisión. Si algún día Mercado Pago retiene
 * el dinero, esta separación es la que permite explicar por qué el saldo
 * no cuadra con las ventas.
 */

import { CUENTA_DIGITAL, leerMovimientosRango, type MovimientoCaja } from './caja';
import { comisionDeVenta, METODOS_CON_COMISION } from './comision';
import { getSheetData } from './googleSheets';
import { normalizarMetodoPago } from './negocio';
import { parsearFechaHora } from './pedidoFecha';

/** Formas de cobro cuyo dinero cae en la cuenta, no en el cajón. */
export const METODOS_EN_CUENTA = ['Terminal', 'Pago en línea', 'Transferencia'];

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface EntradaPorMetodo {
  metodo: string;
  cobros: number;
  /** Lo que pagó el cliente */
  cobrado: number;
  comision: number;
  /** Lo que quedó en la cuenta */
  disponible: number;
}

export interface EstadoCuenta {
  desde: string;
  hasta: string;
  /** Días que abarca el periodo, para calcular el rendimiento anual */
  dias: number;
  porMetodo: EntradaPorMetodo[];
  cobradoTotal: number;
  comisionTotal: number;
  /** Lo que entró a la cuenta por ventas, ya sin comisión */
  disponibleTotal: number;
  /** Lo que pagó el banco por tener el dinero ahí */
  rendimiento: number;
  /** Movimientos a mano que no son ventas ni rendimiento */
  otrasEntradas: number;
  salidas: number;
  /** disponible + rendimiento + otras entradas − salidas */
  movimientoNeto: number;
  movimientos: MovimientoCaja[];
}

/** Días que abarca un rango, contando ambos extremos. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(desde + 'T00:00:00Z');
  const b = Date.parse(hasta + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/**
 * Rendimiento llevado a tasa anual, para poder compararlo con cualquier
 * otra inversión.
 *
 * Se necesita el saldo porque un rendimiento de $6 no dice nada por sí
 * solo: son un 4% anual sobre $6,000 y un 40% sobre $600. Sin saldo
 * devuelve null en vez de inventar un número.
 */
export function rendimientoAnual(
  rendimiento: number,
  saldo: number,
  dias: number
): number | null {
  if (!(saldo > 0) || !(dias > 0) || !(rendimiento > 0)) return null;
  return redondear((rendimiento / saldo) * (365 / dias) * 100);
}

/** Todo lo que le pasó a la cuenta en un rango de fechas. */
export async function leerCuenta(desde: string, hasta: string): Promise<EstadoCuenta> {
  const [pedidos, movimientos] = await Promise.all([
    getSheetData('PEDIDOS'),
    leerMovimientosRango(desde, hasta, CUENTA_DIGITAL).catch(() => [] as MovimientoCaja[]),
  ]);

  const enRango = pedidos
    .filter((p) => p.ID_Pedido)
    .filter((p) => p.Estado !== 'Cancelado' && p.Estado_Pago !== 'Reembolsado')
    .filter((p) => {
      const f = parsearFechaHora(p.Fecha_Hora)?.fechaISO;
      return !!f && f >= desde && f <= hasta;
    });

  const porMetodo: EntradaPorMetodo[] = [];
  for (const metodo of METODOS_EN_CUENTA) {
    const suyos = enRango.filter((p) => normalizarMetodoPago(p.Metodo_Pago) === metodo);
    if (suyos.length === 0) continue;
    const cobrado = suyos.reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0);
    // La transferencia llega íntegra: no pasa por Mercado Pago.
    const comision = METODOS_CON_COMISION.includes(metodo)
      ? suyos.reduce((s, p) => s + comisionDeVenta(parseFloat(p.Total_Final) || 0, metodo), 0)
      : 0;
    porMetodo.push({
      metodo,
      cobros: suyos.length,
      cobrado: redondear(cobrado),
      comision: redondear(comision),
      disponible: redondear(cobrado - comision),
    });
  }

  const suma = (f: (e: EntradaPorMetodo) => number) => redondear(porMetodo.reduce((s, e) => s + f(e), 0));
  const rendimiento = redondear(
    movimientos.filter((m) => m.tipo === 'Rendimiento').reduce((s, m) => s + m.monto, 0)
  );
  const otrasEntradas = redondear(
    movimientos.filter((m) => m.tipo === 'Entrada').reduce((s, m) => s + m.monto, 0)
  );
  const salidas = redondear(
    movimientos.filter((m) => m.tipo === 'Salida').reduce((s, m) => s + m.monto, 0)
  );
  const disponibleTotal = suma((e) => e.disponible);

  return {
    desde,
    hasta,
    dias: diasEntre(desde, hasta),
    porMetodo,
    cobradoTotal: suma((e) => e.cobrado),
    comisionTotal: suma((e) => e.comision),
    disponibleTotal,
    rendimiento,
    otrasEntradas,
    salidas,
    movimientoNeto: redondear(disponibleTotal + rendimiento + otrasEntradas - salidas),
    movimientos,
  };
}
