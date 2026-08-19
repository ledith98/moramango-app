/**
 * rendimiento.ts
 *
 * La cuenta del rendimiento, aparte para que la pueda usar la pantalla.
 *
 * Vive fuera de cuenta.ts a proposito: ese modulo importa googleSheets ->
 * googleapis, que es solo de servidor. Importarlo desde un componente
 * 'use client' arrastra google-auth-library al navegador y rompe la
 * compilacion. Mismo criterio que disponibilidadCliente.ts.
 *
 * Estando aqui, el porcentaje se recalcula al instante mientras se
 * escribe el saldo, sin pedirle nada al servidor.
 */

/**
 * Rendimiento llevado a tasa anual, para poder compararlo con cualquier
 * otra inversion.
 *
 * Se necesita el saldo porque un rendimiento de $6 no dice nada por si
 * solo: son un 4% anual sobre $6,000 y un 40% sobre $600. Sin saldo
 * devuelve null en vez de inventar un numero.
 */
export function rendimientoAnual(
  rendimiento: number,
  saldo: number,
  dias: number
): number | null {
  if (!(saldo > 0) || !(dias > 0) || !(rendimiento > 0)) return null;
  return Math.round((rendimiento / saldo) * (365 / dias) * 100 * 100) / 100;
}
