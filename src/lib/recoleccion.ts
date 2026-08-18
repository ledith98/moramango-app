/**
 * recoleccion.ts
 *
 * A qué hora puede pasar el cliente por su pedido.
 *
 * El 58% de las ventas caen entre 7 y 10 de la mañana. Dejar que el
 * cliente pida antes y elija su hora descarga justo esa punta: se prepara
 * con tiempo y se entrega en segundos.
 *
 * Lógica pura, sin Google Sheets: la usa la tienda para pintar las
 * opciones y el servidor para no aceptar una hora imposible.
 */

import { aMinutos, ahoraEnMonterrey, bonita, type Horario } from './horario';

/** Cada cuánto se ofrece un horario. */
export const PASO_MINUTOS = 15;

/**
 * Mínimo entre que pide y que puede pasar. Ofrecer "en 5 minutos" sería
 * prometerle algo que no se alcanza a preparar en la hora pico.
 */
export const ANTICIPACION_MINIMA = 15;

/** Hasta dónde se ofrecen horarios cuando no hay horario configurado. */
const CIERRE_POR_OMISION = 21 * 60;

const aTexto = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface OpcionRecoleccion {
  /** "08:15" — lo que se guarda en el pedido */
  valor: string;
  /** "8:15 am" — lo que ve el cliente */
  etiqueta: string;
}

/**
 * Horarios que se le ofrecen al cliente hoy.
 *
 * Empieza en la siguiente marca de cuarto de hora que respete la
 * anticipación mínima y termina al cerrar. Si ya no cabe ninguno —se pide
 * a diez minutos de cerrar— devuelve lista vacía y la tienda ofrece solo
 * "lo antes posible", que es la verdad: hoy ya no hay de dónde escoger.
 */
export function horariosDisponibles(horario: Horario, ref: Date = new Date()): OpcionRecoleccion[] {
  const { dia, minutos } = ahoraEnMonterrey(ref);

  let cierre = CIERRE_POR_OMISION;
  let apertura = 0;
  if (horario.activo) {
    const hoy = horario.dias[dia];
    if (!hoy?.abierto) return [];
    const desde = aMinutos(hoy.desde);
    const hasta = aMinutos(hoy.hasta);
    if (desde === null || hasta === null || hasta <= desde) return [];
    apertura = desde;
    cierre = hasta;
  }

  // El primer horario posible, redondeado hacia arriba al cuarto de hora
  const minimo = Math.max(apertura, minutos + ANTICIPACION_MINIMA);
  const inicio = Math.ceil(minimo / PASO_MINUTOS) * PASO_MINUTOS;

  const opciones: OpcionRecoleccion[] = [];
  for (let m = inicio; m <= cierre && opciones.length < 40; m += PASO_MINUTOS) {
    opciones.push({ valor: aTexto(m), etiqueta: bonita(aTexto(m)) });
  }
  return opciones;
}

/**
 * ¿Se puede aceptar esta hora? Vacío es válido: significa "lo antes
 * posible", que es como funcionaba antes y sigue siendo la opción normal.
 */
export function horaValida(horario: Horario, hora: string, ref: Date = new Date()): boolean {
  const limpia = (hora || '').trim();
  if (!limpia) return true;
  return horariosDisponibles(horario, ref).some((o) => o.valor === limpia);
}

/** "8:15 am" para el ticket y el aviso; vacío si no eligió hora. */
export function horaBonita(hora: string): string {
  const limpia = (hora || '').trim();
  return limpia ? bonita(limpia) : '';
}
