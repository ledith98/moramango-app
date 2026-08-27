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

import { guardarAjuste } from './ajustes';
import { CUENTA_DIGITAL, leerMovimientosRango, type MovimientoCaja } from './caja';
import { comisionDeVenta, METODOS_CON_COMISION } from './comision';
import { getSheetData } from './googleSheets';
import { normalizarMetodoPago } from './negocio';
import { fechaDeCelda, parsearFechaHora } from './pedidoFecha';
import { anotarSaldo, leerSaldos, type SaldoAnotado } from './saldos';

export { rendimientoAnual } from './rendimiento';

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
  /** Los de la cuenta Y los del cajón: se anotan desde la misma pantalla */
  movimientos: MovimientoCaja[];
  /** Lo último que se capturó como saldo real, y de cuándo es */
  saldo: number | null;
  saldoFecha: string;
  /** Todas las veces que se ha anotado el saldo, de la más nueva atrás */
  historialSaldos: SaldoAnotado[];
  /**
   * Todo lo que ha pasado en la cuenta desde la primera venta, sin filtro
   * de fechas. Es el desglose de `totalHistorico`: los mismos números que
   * se comparan contra el saldo del banco, pero uno por uno.
   */
  desdeSiempre: {
    /** Día de la primera venta que cayó en la cuenta */
    desde: string;
    ventas: number;
    rendimiento: number;
    entradas: number;
    salidas: number;
    cuantasSalidas: number;
  };
  /** Rendimientos, entradas y salidas de la cuenta, de lo más nuevo atrás */
  movimientosCuenta: MovimientoCaja[];
  /**
   * Todo lo que ha entrado a la cuenta desde la primera venta, sin filtro
   * de fechas.
   *
   * Es lo único que se puede comparar contra el saldo de Mercado Pago:
   * ese saldo es acumulado desde el día uno, así que enfrentarlo contra el
   * movimiento de un periodo daría siempre una diferencia falsa.
   */
  totalHistorico: number;
}

/** Dónde se guarda el saldo que ella copia de la app del banco. */
export const CLAVE_SALDO = 'SaldoCuenta';

/**
 * Guarda el saldo con la fecha en que se tomó.
 *
 * Sin la fecha el número envejece sin avisar: un saldo de hace tres
 * semanas se ve igual de confiable que el de hoy, y no lo es.
 *
 * Va a dos lugares: el ajuste guarda EL ÚLTIMO —que es lo que compara la
 * pantalla contra Mercado Pago— y la hoja de saldos guarda TODOS, para
 * poder ver cómo ha ido creciendo la cuenta. Antes solo existía el
 * primero, así que cada captura borraba la anterior.
 */
export async function guardarSaldo(
  monto: number,
  fechaISO: string,
  quien = ''
): Promise<void> {
  const valor = Math.round(monto * 100) / 100;
  await guardarAjuste(CLAVE_SALDO, valor, fechaISO);
  await anotarSaldo(valor, fechaISO, quien);
}

/** Días que abarca un rango, contando ambos extremos. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(desde + 'T00:00:00Z');
  const b = Date.parse(hasta + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** Todo lo que le pasó a la cuenta en un rango de fechas. */
export async function leerCuenta(desde: string, hasta: string): Promise<EstadoCuenta> {
  const [pedidos, movimientos, todosLosMovimientos, ajustes, historialSaldos] = await Promise.all([
    getSheetData('PEDIDOS'),
    leerMovimientosRango(desde, hasta).catch(() => [] as MovimientoCaja[]),
    // Desde antes de que existiera el negocio hasta bien entrado el futuro:
    // el acumulado no lleva filtro, y así se lee la hoja una sola vez.
    leerMovimientosRango('2000-01-01', '2999-12-31', CUENTA_DIGITAL).catch(
      () => [] as MovimientoCaja[]
    ),
    getSheetData('Ajustes_Tienda', { crudo: true }).catch(() => [] as Record<string, string>[]),
    leerSaldos().catch(() => [] as SaldoAnotado[]),
  ]);
  // Solo lo de la cuenta cuenta para la matemática de la cuenta; los del
  // cajón se muestran, pero suman en el corte de caja, no aquí.
  const deLaCuenta = movimientos.filter((m) => m.cuenta === CUENTA_DIGITAL);

  const filaSaldo = ajustes.find((a) => a.Clave === CLAVE_SALDO);
  const saldoGuardado = parseFloat((filaSaldo?.Valor ?? '').toString());

  const vivos = pedidos
    .filter((p) => p.ID_Pedido)
    .filter((p) => p.Estado !== 'Cancelado' && p.Estado_Pago !== 'Reembolsado');

  const enRango = vivos.filter((p) => {
    const f = parsearFechaHora(p.Fecha_Hora)?.fechaISO;
    return !!f && f >= desde && f <= hasta;
  });

  /**
   * El acumulado de siempre, para poder enfrentarlo contra el saldo de
   * Mercado Pago. Se calcula con las mismas reglas que el periodo — mismas
   * formas de cobro, misma comisión — para que la comparación signifique
   * algo.
   */
  const disponibleHistorico = vivos
    .filter((p) => METODOS_EN_CUENTA.includes(normalizarMetodoPago(p.Metodo_Pago)))
    .reduce((suma, p) => {
      const metodo = normalizarMetodoPago(p.Metodo_Pago);
      const total = parseFloat(p.Total_Final) || 0;
      const comision = METODOS_CON_COMISION.includes(metodo)
        ? comisionDeVenta(total, metodo)
        : 0;
      return suma + total - comision;
    }, 0);

  const netoDe = (tipo: string, lista: MovimientoCaja[]) =>
    lista.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);

  const rendHistorico = netoDe('Rendimiento', todosLosMovimientos);
  const entrHistorico = netoDe('Entrada', todosLosMovimientos);
  const salHistorico = netoDe('Salida', todosLosMovimientos);

  const totalHistorico = redondear(
    disponibleHistorico + rendHistorico + entrHistorico - salHistorico
  );

  /** El primer día que entró dinero a la cuenta, para poder decir «desde». */
  const primeraVenta = vivos
    .filter((p) => METODOS_EN_CUENTA.includes(normalizarMetodoPago(p.Metodo_Pago)))
    .map((p) => parsearFechaHora(p.Fecha_Hora)?.fechaISO ?? '')
    .filter(Boolean)
    .sort()[0] ?? '';

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
    deLaCuenta.filter((m) => m.tipo === 'Rendimiento').reduce((s, m) => s + m.monto, 0)
  );
  const otrasEntradas = redondear(
    deLaCuenta.filter((m) => m.tipo === 'Entrada').reduce((s, m) => s + m.monto, 0)
  );
  const salidas = redondear(
    deLaCuenta.filter((m) => m.tipo === 'Salida').reduce((s, m) => s + m.monto, 0)
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
    saldo: isFinite(saldoGuardado) ? saldoGuardado : null,
    // La fecha pasa por fechaDeCelda porque Google convierte "2026-08-26"
    // en el número 46260 al guardarlo, y en pantalla se leía así de feo.
    saldoFecha: fechaDeCelda(filaSaldo?.Nota),
    historialSaldos,
    totalHistorico,
    desdeSiempre: {
      desde: primeraVenta,
      ventas: redondear(disponibleHistorico),
      rendimiento: redondear(rendHistorico),
      entradas: redondear(entrHistorico),
      salidas: redondear(salHistorico),
      cuantasSalidas: todosLosMovimientos.filter((m) => m.tipo === 'Salida').length,
    },
    // Del más nuevo al más viejo: lo último que pasó es lo que se busca
    movimientosCuenta: [...todosLosMovimientos].sort((a, b) =>
      a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0
    ),
  };
}
