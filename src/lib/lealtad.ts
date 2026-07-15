/**
 * lealtad.ts
 *
 * Reglas del programa de lealtad, en un solo lugar para que los pedidos
 * de la app y las ventas de mostrador se comporten igual.
 *
 * Reglas:
 * - Se acumula 1 por PEDIDO (no por artículos).
 * - 5 pedidos  → 15% de descuento (canjearlo NO reinicia el ciclo).
 * - 10 pedidos → Artículo gratis ≤ $35 (canjearlo SÍ reinicia el ciclo).
 * - Un solo beneficio activo a la vez.
 *
 * Importante: las columnas de USUARIOS se resuelven por NOMBRE de
 * encabezado (ensureColumn), nunca por índice fijo.
 */

import { ensureColumn, findRow, updateCell } from './googleSheets';

export const META_DESCUENTO = 5;
export const META_ARTICULO = 10;

export type Beneficio = 'Ninguno' | '15% Descuento' | 'Articulo Gratis';

/** Descuento en pesos que otorga un beneficio sobre el total bruto. */
export function descuentoPorBeneficio(beneficio: string, totalBruto: number): number {
  if (beneficio === '15% Descuento') return totalBruto * 0.15;
  // El artículo gratis se descuenta al elegir el artículo, no aquí
  return 0;
}

interface EstadoLealtad {
  cicloActual: number;
  historicoActual: number;
  beneficioActual: string;
  beneficioCanjeado?: string;
}

/** Calcula cómo queda la lealtad del cliente tras registrarle un pedido. */
export function siguienteEstadoLealtad({
  cicloActual,
  historicoActual,
  beneficioActual,
  beneficioCanjeado,
}: EstadoLealtad): { cicloFinal: number; historicoFinal: number; beneficioNuevo: string } {
  const nuevoCiclo = cicloActual + 1;
  let beneficioNuevo = beneficioActual || 'Ninguno';
  let cicloFinal = nuevoCiclo;

  if (beneficioCanjeado === 'Articulo Gratis') {
    // Solo el artículo gratis reinicia el ciclo
    cicloFinal = 0;
    beneficioNuevo = 'Ninguno';
  } else if (beneficioCanjeado === '15% Descuento') {
    // El descuento NO reinicia el ciclo, sigue acumulando
    beneficioNuevo = 'Ninguno';
  } else {
    // No se canjeó nada — ¿se ganó un beneficio nuevo?
    if (nuevoCiclo >= META_ARTICULO) beneficioNuevo = 'Articulo Gratis';
    else if (nuevoCiclo >= META_DESCUENTO) beneficioNuevo = '15% Descuento';
  }

  return { cicloFinal, historicoFinal: historicoActual + 1, beneficioNuevo };
}

/**
 * Registra un pedido en la lealtad del cliente y guarda el resultado.
 * No lanza: si algo falla, se registra en logs (nunca debe tumbar la venta).
 */
export async function actualizarLealtad(idUsuario: string, beneficioCanjeado?: string): Promise<void> {
  if (!idUsuario) return;
  try {
    const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', idUsuario);
    if (!usuarioRow) return;

    const { cicloFinal, historicoFinal, beneficioNuevo } = siguienteEstadoLealtad({
      cicloActual: parseInt(usuarioRow.data.Ciclo_Actual) || 0,
      historicoActual: parseInt(usuarioRow.data.Total_Articulos_Historico) || 0,
      beneficioActual: usuarioRow.data.Beneficio_Disponible || 'Ninguno',
      beneficioCanjeado,
    });

    const [colCiclo, colHistorico, colBeneficio] = await Promise.all([
      ensureColumn('USUARIOS', 'Ciclo_Actual'),
      ensureColumn('USUARIOS', 'Total_Articulos_Historico'),
      ensureColumn('USUARIOS', 'Beneficio_Disponible'),
    ]);
    await updateCell('USUARIOS', usuarioRow.rowIndex, colCiclo, cicloFinal);
    await updateCell('USUARIOS', usuarioRow.rowIndex, colHistorico, historicoFinal);
    await updateCell('USUARIOS', usuarioRow.rowIndex, colBeneficio, beneficioNuevo);
  } catch (error) {
    console.error('Error actualizando lealtad:', error);
  }
}
