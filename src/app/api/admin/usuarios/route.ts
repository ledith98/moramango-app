/**
 * app/api/admin/usuarios/route.ts
 *
 * GET   → Lista de clientes/usuarios
 * PATCH → Activar/desactivar acceso (Activo), cambiar rol (Rol) y corregir
 *         nombre, teléfono o notas.
 *
 * El email NO se edita: es la cuenta de Google con la que entra. Cambiarlo
 * lo dejaría sin poder iniciar sesión, o peor, apuntando a la cuenta de
 * otra persona.
 *
 * Orden de columnas en USUARIOS (ver src/lib/authOptions.ts):
 * A: ID_Usuario  B: Nombre  C: Telefono  D: Rol  E: Email
 * F: Fecha_Registro  G: Ciclo_Actual  H: Total_Articulos_Historico
 * I: Beneficio_Disponible  J: Notas_Admin  K: Activo  L: Ultimo_Acceso
 */

import { NextRequest, NextResponse } from 'next/server';
import { findRow, getSheetData, updateCell, updateCells } from '@/lib/googleSheets';
import { getAdminSession } from '@/lib/roles';
import { claveTelefono, telefonoUtil } from '@/lib/telefono';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const usuarios = await getSheetData('USUARIOS');
  return NextResponse.json({ usuarios });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { idUsuario, activo, rol, nombre, telefono, notas } = await req.json();

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

  // Datos de contacto. Van juntos en un solo viaje a Google.
  const celdas: Record<number, string> = {};

  if (typeof nombre === 'string') {
    if (!nombre.trim()) {
      return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
    }
    celdas[2] = nombre.trim();
  }

  if (typeof telefono === 'string') {
    const nuevo = telefono.trim();
    // Mismo candado que en el perfil del cliente: un número no puede
    // quedar en dos cuentas, y se compara por los últimos 10 dígitos
    // para que el formato no lo burle.
    if (telefonoUtil(nuevo)) {
      const usuarios = await getSheetData('USUARIOS');
      const enOtra = usuarios.find(
        (u) =>
          u.ID_Usuario !== idUsuario && claveTelefono(u.Telefono) === claveTelefono(nuevo)
      );
      if (enOtra) {
        return NextResponse.json(
          { error: `Ese número ya está en la cuenta de ${enOtra.Nombre || enOtra.ID_Usuario}` },
          { status: 409 }
        );
      }
    }
    celdas[3] = nuevo;
  }

  if (typeof notas === 'string') {
    celdas[10] = notas.trim();
  }

  if (Object.keys(celdas).length > 0) {
    await updateCells('USUARIOS', fila.rowIndex, celdas);
  }

  return NextResponse.json({ success: true });
}
