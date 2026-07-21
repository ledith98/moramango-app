/**
 * app/api/admin/diag-point/route.ts
 *
 * TEMPORAL — diagnóstico del Point desde Vercel. Se puede borrar cuando
 * quede resuelto el problema de "no se ve la terminal".
 *
 * Devuelve prefijo/longitud del token que Vercel está usando (sin
 * exponer el token completo) y la respuesta cruda de MP al listar
 * terminales, para comparar contra lo que se ve desde local.
 */

import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  const salida: Record<string, unknown> = {
    tieneToken: !!token,
    tokenPrefijo: token ? token.slice(0, 12) : null,
    tokenLongitud: token ? token.length : 0,
    esTest: token ? token.startsWith('TEST-') : null,
    esProduccion: token ? token.startsWith('APP_USR-') : null,
  };

  if (!token) return NextResponse.json(salida);

  // Consulta users/me para saber qué cuenta está detrás del token
  try {
    const me = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    salida.userMe_status = me.status;
    if (me.ok) {
      const d = await me.json();
      salida.cuenta = { id: d.id, nickname: d.nickname, email: d.email, pais: d.site_id };
    } else {
      salida.userMe_error = (await me.text()).slice(0, 200);
    }
  } catch (e) {
    salida.userMe_error = String(e).slice(0, 200);
  }

  // Consulta terminales Point
  try {
    const dev = await fetch('https://api.mercadopago.com/point/integration-api/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });
    salida.devices_status = dev.status;
    if (dev.ok) {
      const d = await dev.json();
      salida.devices_cantidad = d.devices?.length ?? 0;
      salida.devices = d.devices ?? [];
    } else {
      salida.devices_error = (await dev.text()).slice(0, 300);
    }
  } catch (e) {
    salida.devices_error = String(e).slice(0, 200);
  }

  return NextResponse.json(salida);
}
