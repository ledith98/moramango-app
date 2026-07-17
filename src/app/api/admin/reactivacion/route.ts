/**
 * app/api/admin/reactivacion/route.ts
 *
 * POST { idUsuario, monto, diasVigencia } → genera un cupón de monto
 * fijo para un cliente (campaña de reactivación) y lo deja guardado
 * directo en su cuenta (Beneficio_Disponible), listo para que lo use
 * la próxima vez que compre — en la app o en el mostrador.
 *
 * No sobreescribe un beneficio que el cliente ya se haya ganado; en ese
 * caso responde error para que el admin no se lo lleve por accidente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureColumn, findRow, updateCell } from '@/lib/googleSheets';
import { beneficioVigente, crearBeneficioReactivacion } from '@/lib/lealtad';
import { getAdminSession } from '@/lib/roles';

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idUsuario, monto, diasVigencia } = await req.json();

  const montoNum = parseFloat(monto);
  if (!idUsuario || isNaN(montoNum) || montoNum <= 0) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const vigenciaDias = parseInt(diasVigencia) || 15;

  const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', idUsuario);
  if (!usuarioRow) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const actual = beneficioVigente(usuarioRow.data);
  if (actual !== 'Ninguno') {
    return NextResponse.json(
      { error: `Este cliente ya tiene un beneficio activo (${actual}). No se sobreescribe.` },
      { status: 400 }
    );
  }

  const vence = new Date(Date.now() + vigenciaDias * 86400000).toISOString().slice(0, 10);

  const [colBeneficio, colVence] = await Promise.all([
    ensureColumn('USUARIOS', 'Beneficio_Disponible'),
    ensureColumn('USUARIOS', 'Fecha_Expiracion_Beneficio'),
  ]);
  await updateCell('USUARIOS', usuarioRow.rowIndex, colBeneficio, crearBeneficioReactivacion(montoNum));
  await updateCell('USUARIOS', usuarioRow.rowIndex, colVence, vence);

  return NextResponse.json({
    success: true,
    nombre: usuarioRow.data.Nombre || '',
    telefono: usuarioRow.data.Telefono || '',
    monto: montoNum,
    vence,
  });
}
