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
