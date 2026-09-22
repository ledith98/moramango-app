/**
 * programados.ts
 *
 * Pedidos para otro día: se levantan hoy (o de noche, ya cerrado) y se
 * entregan en la siguiente jornada.
 *
 * Hasta ahora un pedido era siempre para "hoy": fuera de horario la
 * tienda no dejaba pedir, y en el mostrador no había cómo apuntar un
 * encargo para mañana sin que el cierre de la noche lo diera por
 * entregado.
 *
 * Las fechas posibles son dos a lo mucho:
 *   - Hoy, si todavía queda algún horario (incluye antes de abrir: a las
 *     6 am se puede pedir para las 8).
 *   - El siguiente día que se abra (mañana, o el lunes si mañana se
 *     descansa).
 * Más allá no: un encargo para dentro de una semana es otra cosa y se
 * olvida.
 *
 * Lógica pura, sin Google Sheets: la usan la tienda, el mostrador y el
 * servidor al aceptar el pedido.
 */

import { aMinutos, ahoraEnMonterrey, bonita, DIAS_NOMBRE, estadoTienda, type Horario } from './horario';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';
import { horariosDisponibles, type OpcionRecoleccion, PASO_MINUTOS } from './recoleccion';

/** Si no hay horario configurado, un día cualquiera se atiende así. */
const APERTURA_POR_OMISION = 7 * 60;
const CIERRE_POR_OMISION = 21 * 60;

const aTexto = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-09-21" + 1 → "2026-09-22", sin pasar por la zona horaria. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [a, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de una fecha ISO. */
function diaSemana(fechaISO: string): number {
  const [a, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Apertura y cierre de un día, en minutos; null si ese día no se abre. */
function jornada(horario: Horario, dia: number): { desde: number; hasta: number } | null {
  if (!horario.activo) return { desde: APERTURA_POR_OMISION, hasta: CIERRE_POR_OMISION };
  const d = horario.dias[dia];
  if (!d?.abierto) return null;
  const desde = aMinutos(d.desde);
  const hasta = aMinutos(d.hasta);
  if (desde === null || hasta === null || hasta <= desde) return null;
  return { desde, hasta };
}

/** Todos los horarios de un día completo (para mañana no hay "ya pasó"). */
function horariosDelDia(horario: Horario, dia: number): OpcionRecoleccion[] {
  const j = jornada(horario, dia);
  if (!j) return [];
  const opciones: OpcionRecoleccion[] = [];
  const inicio = Math.ceil(j.desde / PASO_MINUTOS) * PASO_MINUTOS;
  for (let m = inicio; m <= j.hasta && opciones.length < 60; m += PASO_MINUTOS) {
    opciones.push({ valor: aTexto(m), etiqueta: bonita(aTexto(m)) });
  }
  return opciones;
}

export interface DiaDeEntrega {
  /** "2026-09-22" — lo que se guarda en el pedido */
  fecha: string;
  /** "Hoy", "Mañana", "Lunes" */
  etiqueta: string;
  /** "lun 22 sep", para no dejar duda de qué día es */
  detalle: string;
  esHoy: boolean;
  /** A qué hora se abre ese día ("8:00 am"), para "al abrir" */
  apertura: string;
  horarios: OpcionRecoleccion[];
}

/** "lun 22 sep" */
export function fechaCorta(fechaISO: string): string {
  const f = fechaDeCelda(fechaISO);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  const [, m, d] = f.split('-').map(Number);
  return `${DIAS_NOMBRE[diaSemana(f)].slice(0, 3).toLowerCase()} ${d} ${MESES[m - 1]}`;
}

/** Para qué días se puede levantar un pedido ahora mismo. */
export function diasDeEntrega(horario: Horario, ref: Date = new Date()): DiaDeEntrega[] {
  const hoyISO = fechaHoyMTY();
  const { dia } = ahoraEnMonterrey(ref);
  const salida: DiaDeEntrega[] = [];

  const deHoy = horariosDisponibles(horario, ref);
  const jHoy = jornada(horario, dia);
  // Abierto y a punto de cerrar ya no hay horarios para elegir, pero
  // "lo antes posible" sigue valiendo: hoy se queda en la lista.
  if (jHoy && (deHoy.length > 0 || estadoTienda(horario, ref).abierta)) {
    salida.push({
      fecha: hoyISO,
      etiqueta: 'Hoy',
      detalle: fechaCorta(hoyISO),
      esHoy: true,
      apertura: bonita(aTexto(jHoy.desde)),
      horarios: deHoy,
    });
  }

  for (let i = 1; i <= 7; i++) {
    const fecha = sumarDias(hoyISO, i);
    const d = diaSemana(fecha);
    const j = jornada(horario, d);
    if (!j) continue;
    salida.push({
      fecha,
      etiqueta: i === 1 ? 'Mañana' : DIAS_NOMBRE[d],
      detalle: fechaCorta(fecha),
      esHoy: false,
      apertura: bonita(aTexto(j.desde)),
      horarios: horariosDelDia(horario, d),
    });
    break;
  }
  return salida;
}

/**
 * ¿Se puede aceptar esta fecha y hora? Hora vacía significa "lo antes
 * posible" hoy, o "al abrir" otro día.
 */
export function entregaValida(
  horario: Horario,
  fecha: string,
  hora: string,
  ref: Date = new Date()
): boolean {
  const d = diasDeEntrega(horario, ref).find((x) => x.fecha === fecha);
  if (!d) return false;
  const limpia = (hora || '').trim();
  return !limpia || d.horarios.some((h) => h.valor === limpia);
}

/**
 * "📅 Mañana lun 22 sep · 8:15 am" para el aviso y el ticket; vacío si
 * el pedido es para hoy.
 */
export function textoProgramado(fecha: string, hora: string): string {
  const f = fechaDeCelda(fecha);
  if (!f || f <= fechaHoyMTY()) return '';
  const cuando = f === sumarDias(fechaHoyMTY(), 1) ? 'Mañana' : 'El';
  return `📅 ${cuando} ${fechaCorta(f)}${hora ? ` · ${bonita(hora)}` : ' · al abrir'}`;
}
