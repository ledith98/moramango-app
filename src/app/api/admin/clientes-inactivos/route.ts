/**
 * app/api/admin/clientes-inactivos/route.ts
 *
 * GET ?dias=45 → clientes que SÍ han comprado antes pero cuyo último
 * pedido (no cancelado) fue hace más de N días. Pensado para campañas
 * de reactivación.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { beneficioVigente } from '@/lib/lealtad';
import { fechaHoyMTY, parsearFechaHora } from '@/lib/pedidoFecha';
import { getAdminSession } from '@/lib/roles';

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const umbralDias = parseInt(new URL(req.url).searchParams.get('dias') || '45') || 45;

  const [usuarios, pedidos] = await Promise.all([
    getSheetData('USUARIOS'),
    getSheetData('PEDIDOS'),
  ]);

  // Última compra (no cancelada) por usuario, comparando fechaISO como texto
  const ultimaCompra = new Map<string, string>();
  for (const p of pedidos) {
    if (!p.ID_Usuario || p.Estado === 'Cancelado') continue;
    const f = parsearFechaHora(p.Fecha_Hora)?.fechaISO;
    if (!f) continue;
    const actual = ultimaCompra.get(p.ID_Usuario);
    if (!actual || f > actual) ultimaCompra.set(p.ID_Usuario, f);
  }

  const hoy = fechaHoyMTY();
  const [hy, hm, hd] = hoy.split('-').map(Number);
  const hoyMs = Date.UTC(hy, hm - 1, hd);
  const diasDesde = (fechaISO: string) => {
    const [y, m, d] = fechaISO.split('-').map(Number);
    return Math.round((hoyMs - Date.UTC(y, m - 1, d)) / 86400000);
  };

  const inactivos = usuarios
    .filter((u) => (u.Activo || '').toLowerCase() !== 'no')
    .map((u) => {
      const ultima = ultimaCompra.get(u.ID_Usuario);
      return { u, ultima, diasSinComprar: ultima ? diasDesde(ultima) : null };
    })
    // Solo clientes que SÍ han comprado antes (si nunca pidieron, no "se alejaron")
    // y cuya última compra ya rebasó el umbral.
    .filter(({ diasSinComprar }) => diasSinComprar !== null && diasSinComprar >= umbralDias)
    .sort((a, b) => (b.diasSinComprar ?? 0) - (a.diasSinComprar ?? 0))
    .map(({ u, ultima, diasSinComprar }) => ({
      id: u.ID_Usuario,
      nombre: u.Nombre || '',
      telefono: u.Telefono || '',
      ultimaCompra: ultima,
      diasSinComprar,
      beneficioActivo: beneficioVigente(u) !== 'Ninguno' ? beneficioVigente(u) : null,
    }));

  return NextResponse.json({ inactivos, umbralDias });
}
