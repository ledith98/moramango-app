/**
 * beneficioCliente.ts
 *
 * Parseo del beneficio de lealtad, SIN dependencias de servidor (nada de
 * googleSheets/googleapis). Se puede importar tanto en API routes como
 * en componentes 'use client' (tienda y punto de venta) sin arrastrar
 * el cliente de Google Sheets al bundle del navegador.
 */

const PREFIJO_REACTIVACION = 'Reactivacion:';

export const esBeneficioReactivacion = (b: string): boolean => b.startsWith(PREFIJO_REACTIVACION);

export const crearBeneficioReactivacion = (montoPesos: number): string =>
  `${PREFIJO_REACTIVACION}${montoPesos}`;

export const montoReactivacion = (b: string): number =>
  parseFloat(b.slice(PREFIJO_REACTIVACION.length)) || 0;
