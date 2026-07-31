/**
 * horario.ts
 *
 * Horario de atención: a qué hora se pueden hacer pedidos desde la tienda.
 *
 * Aquí solo vive la lógica pura (sin Google Sheets) porque la tienda —que
 * corre en el celular del cliente— también necesita saber si está abierto
 * para no dejarlo llenar el carrito y rebotarlo hasta el final.
 *
 * Todo se calcula en la hora de Monterrey, no en la del celular del
 * cliente: alguien de otro estado vería el local abierto a deshoras.
 */

export interface DiaHorario {
  /** false = ese día no se abre */
  abierto: boolean;
  /** "HH:MM" en 24 h */
  desde: string;
  hasta: string;
}

export interface Horario {
  /**
   * false = sin restricción, se puede pedir a cualquier hora.
   * Es el estado de arranque a propósito: mientras la dueña no configure
   * su horario, el negocio se comporta como siempre y nadie se queda sin
   * poder pedir por un horario que nunca capturó.
   */
  activo: boolean;
  /** 7 días, empezando en domingo (igual que getDay()) */
  dias: DiaHorario[];
}

export const DIAS_NOMBRE = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const ZONA = 'America/Monterrey';

/** Punto de partida al activar el horario por primera vez. */
export const HORARIO_DEFAULT: Horario = {
  activo: false,
  dias: [
    { abierto: false, desde: '08:00', hasta: '16:00' }, // domingo
    { abierto: true, desde: '08:00', hasta: '16:00' },
    { abierto: true, desde: '08:00', hasta: '16:00' },
    { abierto: true, desde: '08:00', hasta: '16:00' },
    { abierto: true, desde: '08:00', hasta: '16:00' },
    { abierto: true, desde: '08:00', hasta: '16:00' },
    { abierto: true, desde: '08:00', hasta: '14:00' }, // sábado
  ],
};

/** "HH:MM" → minutos desde medianoche. Devuelve null si viene mal escrito. */
export function aMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 480 → "8:00 am", para leerlo como lo diría una persona. */
export function bonita(hhmm: string): string {
  const min = aMinutos(hhmm);
  if (min === null) return hhmm;
  const h24 = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, '0');
  const sufijo = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${sufijo}`;
}

/** Día de la semana y minutos transcurridos, en hora de Monterrey. */
export function ahoraEnMonterrey(ref: Date = new Date()): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ref);
  const parte = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dia = Math.max(0, dias.indexOf(parte('weekday')));
  // A las 24:00 algunos motores devuelven "24" en vez de "00"
  const hora = Number(parte('hour')) % 24;
  return { dia, minutos: hora * 60 + Number(parte('minute')) };
}

export interface EstadoTienda {
  abierta: boolean;
  /** Explicación lista para mostrarle al cliente */
  mensaje: string;
}

/**
 * ¿Se puede pedir en este momento?
 *
 * Un día con `hasta` menor o igual que `desde` se considera mal capturado y
 * se trata como cerrado, en vez de adivinar que cruza la medianoche.
 */
export function estadoTienda(horario: Horario, ref: Date = new Date()): EstadoTienda {
  if (!horario.activo) return { abierta: true, mensaje: '' };

  const { dia, minutos } = ahoraEnMonterrey(ref);
  const hoy = horario.dias[dia];

  if (hoy?.abierto) {
    const desde = aMinutos(hoy.desde);
    const hasta = aMinutos(hoy.hasta);
    if (desde !== null && hasta !== null && hasta > desde) {
      if (minutos < desde) {
        return { abierta: false, mensaje: `Hoy abrimos a las ${bonita(hoy.desde)}.` };
      }
      if (minutos < hasta) {
        return { abierta: true, mensaje: `Hoy cerramos a las ${bonita(hoy.hasta)}.` };
      }
      return {
        abierta: false,
        mensaje: `Ya cerramos por hoy (cerramos a las ${bonita(hoy.hasta)}). ${proximaApertura(
          horario,
          dia
        )}`.trim(),
      };
    }
  }

  return {
    abierta: false,
    mensaje: `Hoy no abrimos. ${proximaApertura(horario, dia)}`.trim(),
  };
}

/** "Abrimos el lunes a las 8:00 am" — busca el siguiente día con horario válido. */
function proximaApertura(horario: Horario, diaHoy: number): string {
  for (let i = 1; i <= 7; i++) {
    const d = (diaHoy + i) % 7;
    const dh = horario.dias[d];
    if (!dh?.abierto) continue;
    const desde = aMinutos(dh.desde);
    const hasta = aMinutos(dh.hasta);
    if (desde === null || hasta === null || hasta <= desde) continue;
    const cuando = i === 1 ? 'mañana' : `el ${DIAS_NOMBRE[d].toLowerCase()}`;
    return `Abrimos ${cuando} a las ${bonita(dh.desde)}.`;
  }
  return '';
}

/* ── Guardado: cabe en una sola celda de la hoja de ajustes ── */
// Ejemplo: "activo;0:cerrado|1:08:00-16:00|2:08:00-16:00|…"

export function serializarHorario(h: Horario): string {
  const dias = h.dias
    .map((d, i) => `${i}:${d.abierto ? `${d.desde}-${d.hasta}` : 'cerrado'}`)
    .join('|');
  return `${h.activo ? 'activo' : 'inactivo'};${dias}`;
}

export function parsearHorario(crudo: string): Horario {
  const texto = (crudo || '').trim();
  if (!texto) return HORARIO_DEFAULT;

  const [bandera, listaDias = ''] = texto.split(';');
  const dias = HORARIO_DEFAULT.dias.map((d) => ({ ...d }));

  for (const tramo of listaDias.split('|')) {
    const corte = tramo.indexOf(':');
    if (corte === -1) continue;
    const i = Number(tramo.slice(0, corte));
    if (!Number.isInteger(i) || i < 0 || i > 6) continue;
    // El valor trae ":" adentro ("08:00-16:00"), por eso se corta en el primero
    const resto = tramo.slice(corte + 1).trim();

    if (resto.toLowerCase() === 'cerrado') {
      dias[i].abierto = false;
      continue;
    }
    const [desde, hasta] = resto.split('-').map((x) => (x || '').trim());
    if (aMinutos(desde) === null || aMinutos(hasta) === null) continue;
    dias[i] = { abierto: true, desde, hasta };
  }

  return { activo: bandera.trim().toLowerCase() === 'activo', dias };
}
