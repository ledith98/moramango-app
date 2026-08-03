/**
 * app/api/usuario/route.ts
 *
 * GET   → Devuelve datos del usuario logueado (lealtad + perfil)
 * PATCH → Actualiza nombre y/o teléfono del usuario logueado en el sheet
 *
 * Solo se pueden modificar nombre y teléfono desde este endpoint.
 * Rol, Activo, Ciclo_Actual, etc. NO se pueden cambiar aquí por seguridad.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { findRow, getSheetData, updateCell } from '@/lib/googleSheets';
import { beneficioVigente } from '@/lib/lealtad';
import { claveTelefono, telefonoUtil } from '@/lib/telefono';
import { fusionarFichaDeMostrador } from '@/lib/fusionCuentas';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const usuario = session.user as any;
  const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', usuario.id_usuario);

  if (!usuarioRow) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  const cicloActual = parseInt(usuarioRow.data.Ciclo_Actual) || 0;
  const beneficioDisponible = beneficioVigente(usuarioRow.data);

  return NextResponse.json({
    // Datos de perfil (para precargar formulario)
    nombre: usuarioRow.data.Nombre || '',
    telefono: usuarioRow.data.Telefono || '',
    // Datos de lealtad
    cicloActual,
    beneficioDisponible,
    pedidosParaDescuento: Math.max(0, 5 - cicloActual),
    pedidosParaArticulo: Math.max(0, 10 - cicloActual),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Debes iniciar sesión' }, { status: 401 });
  }

  const { nombre, telefono } = await req.json();

  const usuario = session.user as any;
  const usuarioRow = await findRow('USUARIOS', 'ID_Usuario', usuario.id_usuario);

  if (!usuarioRow) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  // Actualizar solo los campos que llegaron
  // Columnas: B(2)=Nombre, C(3)=Telefono
  if (typeof nombre === 'string' && nombre.trim()) {
    await updateCell('USUARIOS', usuarioRow.rowIndex, 2, nombre.trim());
  }
  if (typeof telefono === 'string') {
    const nuevoTel = telefono.trim();
    // Un teléfono no puede quedar registrado en dos cuentas distintas. Se
    // compara por los últimos 10 dígitos (el número local): con
    // comparación exacta, "8117850462" y "+52 8117850462" pasaban como
    // distintos y el mismo número acababa en dos cuentas.
    let avisoFusion = '';
    if (telefonoUtil(nuevoTel)) {
      const usuarios = await getSheetData('USUARIOS');
      const otra = usuarios.find(
        (u) =>
          u.ID_Usuario !== usuario.id_usuario &&
          claveTelefono(u.Telefono) === claveTelefono(nuevoTel)
      );

      if (otra) {
        // Con correo es una cuenta de Google de otra persona: ahí no se
        // toca nada. Sin correo es una ficha del mostrador, casi siempre
        // del mismo cliente que ahora se bajó la app.
        if ((otra.Email || '').trim()) {
          return NextResponse.json(
            { error: 'Ese número ya está registrado en otra cuenta.' },
            { status: 409 }
          );
        }

        const r = await fusionarFichaDeMostrador(usuario.id_usuario, otra.ID_Usuario);
        avisoFusion =
          r.pedidosMovidos > 0
            ? `Encontramos ${r.pedidosMovidos} compra${
                r.pedidosMovidos === 1 ? '' : 's'
              } que ya habías hecho en el local y ${
                r.pedidosMovidos === 1 ? 'la sumamos' : 'las sumamos'
              } a tu cuenta.`
            : 'Ya tenías un registro en el local y lo unimos con tu cuenta.';
      }
    }
    await updateCell('USUARIOS', usuarioRow.rowIndex, 3, nuevoTel);
    if (avisoFusion) {
      return NextResponse.json({ success: true, aviso: avisoFusion });
    }
  }

  return NextResponse.json({ success: true });
}
