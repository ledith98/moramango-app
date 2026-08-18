/**
 * corteDia.ts
 *
 * El resumen del día en un solo mensaje de Telegram.
 *
 * Toda esta información ya existe, pero repartida en cuatro pantallas
 * (Métricas, Caja, Pedidos, Insumos). Al cerrar, nadie va a recorrerlas:
 * si el resumen no llega solo, no se ve.
 */

import { comisionDeVenta } from './comision';
import { getSheetData } from './googleSheets';
import { normalizarMetodoPago } from './negocio';
import { fechaHoyMTY, parsearFechaHora } from './pedidoFecha';

const dinero = (n: number) => `$${n.toFixed(2)}`;

/**
 * Arma el mensaje del corte. Devuelve null si no hubo movimiento: mandar
 * "vendiste $0" un domingo cerrado solo entrena a ignorar el aviso.
 */
export async function armarCorteDelDia(fechaISO = fechaHoyMTY()): Promise<string | null> {
  const [pedidos, activos] = await Promise.all([
    getSheetData('PEDIDOS'),
    getSheetData('Insumos_Activos', { crudo: true }).catch(() => []),
  ]);

  const delDia = pedidos
    .filter((p) => p.ID_Pedido)
    .filter((p) => parsearFechaHora(p.Fecha_Hora)?.fechaISO === fechaISO);

  const validos = delDia.filter(
    (p) => p.Estado !== 'Cancelado' && p.Estado_Pago !== 'Reembolsado'
  );
  if (validos.length === 0) return null;

  const total = validos.reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0);

  // Por forma de cobro: es lo que se necesita para cuadrar la caja
  const porMetodo = new Map<string, { n: number; monto: number }>();
  for (const p of validos) {
    const m = normalizarMetodoPago(p.Metodo_Pago) || 'Sin registrar';
    const actual = porMetodo.get(m) ?? { n: 0, monto: 0 };
    actual.n += 1;
    actual.monto += parseFloat(p.Total_Final) || 0;
    porMetodo.set(m, actual);
  }

  // Comisión: se calcula cobro por cobro, el cargo fijo es por venta
  const comision = validos
    .filter((p) => normalizarMetodoPago(p.Metodo_Pago) === 'Terminal')
    .reduce((s, p) => s + comisionDeVenta(parseFloat(p.Total_Final) || 0), 0);

  const pendientes = validos.filter((p) => p.Estado_Pago === 'Pendiente');
  const cancelados = delDia.filter((p) => p.Estado === 'Cancelado');
  const sinEntregar = validos.filter(
    (p) => p.Estado !== 'Entregado' && p.Estado !== 'Cancelado'
  );

  const lineas: string[] = [
    `🧾 <b>Corte del día</b> — ${fechaISO}`,
    ``,
    `💰 Vendiste <b>${dinero(total)}</b> en ${validos.length} venta${validos.length === 1 ? '' : 's'}`,
    `🎟️ Ticket promedio: ${dinero(total / validos.length)}`,
    ``,
  ];

  for (const [metodo, d] of porMetodo) {
    lineas.push(`   ${metodo}: ${dinero(d.monto)} (${d.n})`);
  }

  if (comision > 0) {
    lineas.push(``, `💳 La terminal se llevó <b>${dinero(comision)}</b>`);
    lineas.push(`   Te quedan ${dinero(total - comision)} del día`);
  }

  if (pendientes.length > 0) {
    const monto = pendientes.reduce((s, p) => s + (parseFloat(p.Total_Final) || 0), 0);
    lineas.push(
      ``,
      `⚠️ <b>${pendientes.length} cobro${pendientes.length === 1 ? '' : 's'} sin confirmar</b> — ${dinero(monto)}`,
      `   ${pendientes.map((p) => p.ID_Pedido).join(', ')}`
    );
  }

  if (sinEntregar.length > 0) {
    lineas.push(``, `📦 ${sinEntregar.length} pedido${sinEntregar.length === 1 ? '' : 's'} sin entregar`);
  }
  if (cancelados.length > 0) {
    lineas.push(`❌ ${cancelados.length} cancelado${cancelados.length === 1 ? '' : 's'}`);
  }

  // Insumos por acabarse. Solo los que de verdad urgen: llenar el corte
  // con la lista completa haría que se dejara de leer.
  const porAcabarse = activos
    .map((a) => ({
      nombre: a.Nombre ?? '',
      stock: parseFloat(a.Stock_Actual) || 0,
    }))
    .filter((a) => a.nombre && a.stock <= 0);
  if (porAcabarse.length > 0) {
    lineas.push(
      ``,
      `🛒 Sin existencia: ${porAcabarse.slice(0, 6).map((a) => a.nombre).join(', ')}` +
        (porAcabarse.length > 6 ? ` y ${porAcabarse.length - 6} más` : '')
    );
  }

  return lineas.join('\n');
}
