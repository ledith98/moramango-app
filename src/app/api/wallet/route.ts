/**
 * app/api/wallet/route.ts
 *
 * El enlace para guardar la tarjeta de lealtad en Google Wallet.
 *
 * GET → { listo, enlace }  para el cliente que tiene la sesión abierta
 *
 * Solo emite la tarjeta de QUIEN pide, sacando sus datos de la hoja y no
 * de lo que mande el navegador: si el id viniera por parámetro, cualquiera
 * podría guardarse la tarjeta de otro con los pedidos de otro.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { findRow } from '@/lib/googleSheets';
import { enlaceGuardar, walletListo } from '@/lib/googleWallet';
import { beneficioVigente } from '@/lib/lealtad';

export async function GET() {
  const session = await getServerSession(authOptions);
  const correo = session?.user?.email;
  if (!correo) {
    return NextResponse.json({ error: 'Inicia sesión para guardar tu tarjeta' }, { status: 401 });
  }

  if (!walletListo()) {
    // No es un error: es que todavía no está conectado. La pantalla
    // simplemente no ofrece el botón.
    return NextResponse.json({ listo: false });
  }

  const fila = await findRow('USUARIOS', 'Email', correo);
  if (!fila) {
    return NextResponse.json({ error: 'Todavía no tienes pedidos registrados' }, { status: 404 });
  }

  try {
    const enlace = await enlaceGuardar({
      id: fila.data.ID_Usuario,
      nombre: (fila.data.Nombre || session.user?.name || '').toString().trim(),
      pedidos: parseInt(fila.data.Ciclo_Actual) || 0,
      beneficio: beneficioVigente(fila.data),
    });
    return NextResponse.json({ listo: true, enlace });
  } catch (error) {
    console.error('No se pudo armar la tarjeta de Google Wallet:', error);
    return NextResponse.json(
      { error: 'No se pudo preparar tu tarjeta. Inténtalo más tarde.' },
      { status: 500 }
    );
  }
}
