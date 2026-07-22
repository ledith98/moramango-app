/**
 * disponibilidadCliente.ts
 *
 * La parte de disponibilidad que es lógica pura, sin tocar el Sheet.
 *
 * Vive aparte de disponibilidad.ts a propósito: ese módulo importa
 * googleSheets → googleapis, que es solo de servidor. Importarlo desde un
 * componente 'use client' arrastra todo google-auth-library al navegador y
 * rompe la compilación (child_process no existe ahí). Mismo criterio que
 * beneficioCliente.ts.
 */

/** Texto corto para la tarjeta del producto. '' = no mostrar nada. */
export function avisoDisponibilidad(disponibles: number | null, umbral = 3): string {
  if (disponibles === null || disponibles === undefined) return '';
  if (disponibles <= 0) return 'Agotado';
  if (disponibles <= umbral) {
    return disponibles === 1 ? '¡Última pieza!' : `¡Últimas ${disponibles}!`;
  }
  return '';
}

export interface EstadoVenta {
  /** false = el botón de agregar va apagado */
  sePuedeComprar: boolean;
  /** Texto del distintivo; '' = no mostrar ninguno */
  etiqueta: string;
  /** true = el distintivo va en gris (no es urgencia, es un alto) */
  apagado: boolean;
}

/**
 * Junta las dos razones por las que algo no se vende: la pausa manual del
 * panel y el stock. La pausa manual gana, porque es una decisión explícita
 * del negocio y el número de stock puede estar desactualizado.
 */
export function estadoDeVenta(producto: {
  disponible?: boolean;
  disponibles?: number | null;
}): EstadoVenta {
  if (producto.disponible === false) {
    return { sePuedeComprar: false, etiqueta: 'No disponible por el momento', apagado: true };
  }

  const aviso = avisoDisponibilidad(producto.disponibles ?? null);
  if (aviso === 'Agotado') {
    return { sePuedeComprar: false, etiqueta: 'Agotado por hoy', apagado: true };
  }
  return { sePuedeComprar: true, etiqueta: aviso, apagado: false };
}
