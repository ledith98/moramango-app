/**
 * app/api/admin/ajustes/route.ts
 *
 * Ajustes del negocio configurables desde el panel.
 * GET  → valores actuales
 * POST → { topeArticuloGratis?, ordenCategorias? } (se manda solo lo que cambió)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CLAVE_DIRECCION,
  CLAVE_MAPA,
  CLAVE_TOPE_ARTICULO,
  guardarAjuste,
  guardarHorario,
  guardarOrdenCategorias,
  leerAjustes,
} from '@/lib/ajustes';
import { aMinutos, DIAS_NOMBRE } from '@/lib/horario';
import { anotar } from '@/lib/bitacora';
import { getAdminSession } from '@/lib/roles';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  return NextResponse.json(await leerAjustes());
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const quien = sesion.user?.name || sesion.user?.email || '';
  // Cómo estaban antes, para que la bitácora diga "de X a Y"
  const previos = await leerAjustes();

  const { topeArticuloGratis, ordenCategorias, horario, direccion, mapa } = await req.json();

  if (topeArticuloGratis !== undefined) {
    const tope = parseFloat(topeArticuloGratis);
    if (isNaN(tope) || tope <= 0) {
      return NextResponse.json(
        { error: 'El tope debe ser un monto mayor a 0' },
        { status: 400 }
      );
    }
    await guardarAjuste(
      CLAVE_TOPE_ARTICULO,
      Math.round(tope * 100) / 100,
      'Precio máximo del artículo gratis de la décima compra'
    );
  }

  if (ordenCategorias !== undefined) {
    if (!Array.isArray(ordenCategorias) || ordenCategorias.some((c) => typeof c !== 'string')) {
      return NextResponse.json({ error: 'Orden de grupos inválido' }, { status: 400 });
    }
    await guardarOrdenCategorias(ordenCategorias);
  }

  if (horario !== undefined) {
    if (!horario || !Array.isArray(horario.dias) || horario.dias.length !== 7) {
      return NextResponse.json({ error: 'Horario inválido' }, { status: 400 });
    }
    // Un día con la hora de cierre antes de la de apertura dejaría la
    // tienda cerrada todo el día sin que se note, así que no se guarda.
    for (let i = 0; i < 7; i++) {
      const d = horario.dias[i];
      if (!d?.abierto) continue;
      const desde = aMinutos(d.desde);
      const hasta = aMinutos(d.hasta);
      if (desde === null || hasta === null) {
        return NextResponse.json(
          { error: `Revisa las horas del ${DIAS_NOMBRE[i].toLowerCase()}` },
          { status: 400 }
        );
      }
      if (hasta <= desde) {
        return NextResponse.json(
          {
            error: `El ${DIAS_NOMBRE[i].toLowerCase()} la hora de cierre debe ser después de la de apertura`,
          },
          { status: 400 }
        );
      }
    }
    await guardarHorario({
      activo: !!horario.activo,
      dias: horario.dias.map((d: { abierto?: boolean; desde?: string; hasta?: string }) => ({
        abierto: !!d.abierto,
        desde: String(d.desde ?? '08:00'),
        hasta: String(d.hasta ?? '16:00'),
      })),
    });
  }

  if (direccion !== undefined) {
    await guardarAjuste(CLAVE_DIRECCION, (direccion ?? '').toString().trim(), 'Dirección del local');
  }
  if (mapa !== undefined) {
    const url = (mapa ?? '').toString().trim();
    if (url && !/^https:\/\//i.test(url)) {
      return NextResponse.json(
        { error: 'El enlace del mapa debe empezar con https://' },
        { status: 400 }
      );
    }
    await guardarAjuste(CLAVE_MAPA, url, 'Enlace para llegar al local');
  }

  const ahora = await leerAjustes();
  const detalle = [
    topeArticuloGratis !== undefined && previos.topeArticuloGratis !== ahora.topeArticuloGratis
      ? `Tope de artículo gratis: $${previos.topeArticuloGratis} → $${ahora.topeArticuloGratis}`
      : '',
    ordenCategorias !== undefined ? `Orden del menú: ${ahora.ordenCategorias.join(', ')}` : '',
    horario !== undefined ? 'Cambió el horario de la tienda' : '',
    direccion !== undefined && previos.direccion !== ahora.direccion
      ? `Dirección: ${ahora.direccion}`
      : '',
    mapa !== undefined && previos.mapa !== ahora.mapa ? 'Cambió el enlace del mapa' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  if (detalle) await anotar(quien, 'Ajustes', 'Cambió los ajustes de la tienda', detalle);

  return NextResponse.json({ success: true, ajustes: ahora });
}
