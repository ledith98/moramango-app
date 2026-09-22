/**
 * cierreDia.ts
 *
 * Cerrar solos los pedidos que nadie marcó como entregados.
 *
 * El problema no era de disciplina. Un pedido se prepara, se entrega y se
 * cobra en dos minutos con gente esperando; volver al panel a tocar
 * "Entregado" es un paso que se cae solo cuando hay prisa. Así se
 * juntaron 17 pedidos abiertos, el más viejo de casi un mes.
 *
 * Y un pedido abierto no es un detalle cosmético: mientras no se cierra,
 * la pantalla del día lo sigue enseñando como si faltara algo, el aviso
 * de cierre pregunta por él cada noche, y el panel deja de reflejar lo
 * que de verdad pasó en el local. Un dato que nadie mantiene es un dato
 * que miente.
 *
 * La solución es quitar el paso, no exigirlo:
 *
 *   1. Media hora después de entrar, un pedido que nadie movió se marca
 *      entregado solo. En un mostrador, media hora es muchísimo: si
 *      todavía estuviera pendiente, alguien lo habría movido.
 *   2. Al cerrar el día, lo que quede abierto —de hoy o de antes— se
 *      cierra de una vez.
 *
 * LO QUE NO SE CIERRA SOLO: los pedidos sin método de pago. Cerrarlos
 * sería dar por vendida una venta sin saber cómo entró el dinero, y es
 * justo lo que el candado de "¿cómo te pagó?" viene a evitar. Esos se
 * reportan para que alguien los conteste a mano.
 */

import { anotar } from './bitacora';
import { ensureColumn, getSheetData, updateCell } from './googleSheets';
import { fechaDeCelda, fechaHoyMTY, parsearFechaHora } from './pedidoFecha';

/**
 * Cuánto espera antes de cerrar un pedido por su cuenta.
 *
 * Media hora es de ella. Lo suficiente para que nadie vea desaparecer un
 * pedido que está preparando, y lo bastante corto para que la pantalla
 * del día no acumule basura.
 */
export const MINUTOS_PARA_CERRAR_SOLO = 30;

const ENTREGADO = 'Entregado';

export interface ResultadoCierre {
  /** Los que se cerraron, con el estado que traían */
  cerrados: { id: string; estadoAnterior: string }[];
  /** Los que NO se cerraron por no decir cómo se pagaron */
  sinMetodo: { id: string; total: number; estado: string }[];
}

/** "08:15", "8:15:00" o "8:15 p. m." en minutos del día. */
function horaEnMinutos(texto: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(texto);
  if (!m) return 23 * 60 + 59;
  let h = +m[1];
  if (/p\.?\s*m/i.test(texto) && h < 12) h += 12;
  return h * 60 + +m[2];
}

/** Minutos desde una fecha y hora ("2026-09-22", "08:15") hasta ahora. */
function minutosDesdeFechaHora(fechaISO: string, hhmm: string): number {
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' });
  const [f, h] = ahora.split(' ');
  const ahoraMin =
    Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / 60000 +
    +h.slice(0, 2) * 60 +
    +h.slice(3, 5);
  const suyoMin =
    Date.UTC(+fechaISO.slice(0, 4), +fechaISO.slice(5, 7) - 1, +fechaISO.slice(8, 10)) / 60000 +
    horaEnMinutos(hhmm);
  return ahoraMin - suyoMin;
}

/** Minutos que lleva un pedido desde que entró, según el reloj de Monterrey. */
function minutosDesde(fechaHora: string): number | null {
  const p = parsearFechaHora(fechaHora);
  if (!p) return null;
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Monterrey' });
  // 'sv-SE' da "AAAA-MM-DD HH:MM:SS", que se compara y se resta sin
  // pasar por Date() ni arriesgar un corrimiento de zona horaria.
  const [f, h] = ahora.split(' ');
  const ahoraMin =
    Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / 60000 +
    +h.slice(0, 2) * 60 +
    +h.slice(3, 5);
  const pedidoMin =
    Date.UTC(+p.fechaISO.slice(0, 4), +p.fechaISO.slice(5, 7) - 1, +p.fechaISO.slice(8, 10)) /
      60000 +
    +p.horaLegible.slice(0, 2) * 60 +
    +p.horaLegible.slice(3, 5);
  return ahoraMin - pedidoMin;
}

/**
 * Marca como entregados los pedidos que quedaron abiertos.
 *
 * `minutos` filtra por antigüedad: 30 para el barrido de media hora, 0
 * para el cierre del día, que se lleva todo lo que quede. `hasta` limita
 * por fecha; por omisión hoy, que incluye los de días anteriores.
 */
export async function cerrarPedidosPendientes(opciones: {
  minutos?: number;
  hasta?: string;
  quien: string;
  motivo: string;
}): Promise<ResultadoCierre> {
  const { minutos = 0, hasta = fechaHoyMTY(), quien, motivo } = opciones;
  const salida: ResultadoCierre = { cerrados: [], sinMetodo: [] };

  const filas = await getSheetData('PEDIDOS');
  const colEstado = await ensureColumn('PEDIDOS', 'Estado');

  for (let i = 0; i < filas.length; i++) {
    const p = filas[i];
    const id = (p.ID_Pedido ?? '').toString().trim();
    const estado = (p.Estado ?? '').toString().trim();
    if (!id || estado === ENTREGADO || estado === 'Cancelado') continue;

    const cuando = parsearFechaHora(p.Fecha_Hora);
    if (!cuando || cuando.fechaISO > hasta) continue;

    /*
      Un encargo para otro día se cuenta desde el día y la hora en que se
      entrega, no desde que se levantó. Si no, el pedido de las 9 pm para
      mañana a las 8 se cerraría solo esa misma noche, antes de hacerlo.
    */
    const entrega = fechaDeCelda(p.Fecha_Recoleccion);
    const esEncargo = /^\d{4}-\d{2}-\d{2}$/.test(entrega);
    if (esEncargo && entrega > hasta) continue;

    if (minutos > 0) {
      const edad = esEncargo
        ? minutosDesdeFechaHora(entrega, (p.Hora_Recoleccion ?? '').toString().trim() || '23:59')
        : minutosDesde(p.Fecha_Hora);
      if (edad === null || edad < minutos) continue;
    }

    /*
      Sin método de pago no se cierra. Marcarlo entregado lo da por
      vendido, y entonces entra al corte y al saldo de la cuenta sin que
      nadie sepa si fue efectivo, terminal o transferencia — que es
      exactamente el descuadre que costó tres días de conciliación.
    */
    if (!(p.Metodo_Pago ?? '').toString().trim()) {
      salida.sinMetodo.push({
        id,
        total: parseFloat(p.Total_Final) || 0,
        estado,
      });
      continue;
    }

    await updateCell('PEDIDOS', i + 2, colEstado, ENTREGADO);
    salida.cerrados.push({ id, estadoAnterior: estado });
  }

  if (salida.cerrados.length > 0) {
    await anotar(
      quien,
      'Pedidos',
      `Se cerraron solos ${salida.cerrados.length} pedido(s)`,
      `${motivo} · ${salida.cerrados.map((c) => c.id).join(', ')}`
    );
  }
  return salida;
}

/** Una línea para el corte de la noche, o '' si no hubo nada que cerrar. */
export function resumenCierre(r: ResultadoCierre): string {
  const partes: string[] = [];
  if (r.cerrados.length > 0) {
    partes.push(
      `✅ <b>${r.cerrados.length} pedido(s) se marcaron entregados</b> al cerrar el día.`
    );
  }
  if (r.sinMetodo.length > 0) {
    const total = r.sinMetodo.reduce((s, p) => s + p.total, 0);
    partes.push(
      `⚠️ <b>${r.sinMetodo.length} pedido(s) siguen abiertos</b> porque no dicen cómo se pagaron ($${total.toFixed(2)}): ${r.sinMetodo.map((p) => p.id).join(', ')}\n   Ábrelos en Pedidos y dile el método; ahí se cierran.`
    );
  }
  return partes.join('\n\n');
}
