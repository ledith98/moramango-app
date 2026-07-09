/**
 * app/api/admin/usuarios/route.ts
 *
 * GET   → Lista de clientes/usuarios
 * PATCH → Activar/desactivar acceso (Activo) y/o cambiar rol (Rol)
 *
 * Orden de columnas en USUARIOS (ver src/lib/authOptions.ts):
 * A: ID_Usuario  B: Nombre  C: Telefono  D: Rol  E: Email
 * F: Fecha_Registro  G: Ciclo_Actual  H: Total_Articulos_Historico
 * I: Beneficio_Disponible  J: Notas_Admin  K: Activo  L: Ultimo_Acceso
 */

import { NextRequest, NextResponse } from 'next/server';
import { findRow, getSheetData, updateCell } from '@/lib/googleSheets';

export async function GET() {
  const usuarios = await getSheetData('USUARIOS');
  return NextResponse.json({ usuarios });
}

export async function PATCH(req: NextRequest) {
  const { idUsuario, activo, rol } = await req.json();

  if (!idUsuario) {
    return NextResponse.json({ error: 'Falta idUsuario' }, { status: 400 });
  }

  const fila = await findRow('USUARIOS', 'ID_Usuario', idUsuario);
  if (!fila) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  if (typeof rol === 'string') {
    if (!['cliente', 'admin'].includes(rol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }
    await updateCell('USUARIOS', fila.rowIndex, 4, rol);
  }

  if (typeof activo === 'boolean') {
    await updateCell('USUARIOS', fila.rowIndex, 11, activo ? 'si' : 'no');
  }

  return NextResponse.json({ success: true });
}
