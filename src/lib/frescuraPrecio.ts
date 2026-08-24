/**
 * frescuraPrecio.ts
 *
 * Qué tan viejo es un precio anotado.
 *
 * Un precio sin fecha no se puede leer: no se sabe si es de esta semana o
 * de hace medio año, y comparar proveedores contra un precio viejo lleva a
 * ir al lugar equivocado creyendo que se está ahorrando. Con la fecha a la
 * vista, un precio de hace cuatro meses se ve como lo que es —una
 * suposición— y se puede salir a confirmarlo.
 *
 * Los cortes son a ojo de buen cubero, pero no arbitrarios: la fruta y la
 * verdura se mueven semana con semana, y los desechables aguantan meses.
 * Un mes es donde casi todo sigue valiendo; a los tres meses ya no.
 *
 * Módulo puro: no toca Google ni el navegador, así que sirve igual en el
 * panel y en el servidor.
 */

export type EstadoPrecio = 'sin-fecha' | 'al-dia' | 'por-revisar' | 'viejo';

export interface Frescura {
  estado: EstadoPrecio;
  /** Días transcurridos; null si no hay fecha */
  dias: number | null;
  /** "hace 3 días", "hace 2 meses" — para poner junto al precio */
  texto: string;
  /** true = vale la pena preguntar cuánto cuesta ahora */
  conviene: boolean;
}

const DIA = 86400000;

/** "hace 3 días", "hace 2 meses" — como lo diría una persona. */
function haceCuanto(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return 'hace una semana';
  if (dias < 31) return `hace ${Math.round(dias / 7)} semanas`;
  if (dias < 60) return 'hace un mes';
  if (dias < 365) return `hace ${Math.round(dias / 30)} meses`;
  if (dias < 730) return 'hace más de un año';
  return `hace ${Math.floor(dias / 365)} años`;
}

/**
 * @param fechaISO  cuándo se anotó el precio (YYYY-MM-DD); vacío = nunca
 * @param hoyISO    para poder probarlo sin depender del día de hoy
 */
export function frescuraDePrecio(fechaISO: string, hoyISO?: string): Frescura {
  const limpia = (fechaISO || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) {
    return {
      estado: 'sin-fecha',
      dias: null,
      texto: 'sin fecha',
      // Sin fecha no se sabe si sirve, y eso ya es motivo para revisarlo
      conviene: true,
    };
  }

  // Mediodía UTC: a medianoche, el cambio de huso puede correr el día
  const enMs = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  const hoy = hoyISO ? enMs(hoyISO) : Date.now();
  const dias = Math.floor((hoy - enMs(limpia)) / DIA);

  // Una fecha por delante es un error de captura, no un precio del futuro
  if (dias < 0) {
    return { estado: 'al-dia', dias: 0, texto: 'hoy', conviene: false };
  }

  const estado: EstadoPrecio = dias > 90 ? 'viejo' : dias > 30 ? 'por-revisar' : 'al-dia';
  return {
    estado,
    dias,
    texto: haceCuanto(dias),
    conviene: estado !== 'al-dia',
  };
}

/** Colores para la etiqueta, en el mismo orden de gravedad. */
export const COLOR_FRESCURA: Record<EstadoPrecio, string> = {
  'sin-fecha': 'bg-neutral-100 text-neutral-700',
  'al-dia': 'bg-green-100 text-green-800',
  'por-revisar': 'bg-amber-100 text-amber-900',
  viejo: 'bg-red-100 text-red-800',
};
