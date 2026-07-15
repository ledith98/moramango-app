/**
 * app/api/admin/clientes/route.ts
 *
 * GET ?q=  → Busca clientes por teléfono, nombre o código (ID_Usuario)
 *            para poder ligar una venta de mostrador a su lealtad.
 *            Devuelve solo lo necesario para el punto de venta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSheetData } from '@/lib/googleSheets';
import { META_ARTICULO, META_DESCUENTO } from '@/lib/lealtad';
import { getAdminSession } from '@/lib/roles';

const LIMITE = 8;

// Deja solo dígitos, para comparar teléfonos sin importar +52, espacios o guiones
const soloDigitos = (s: string) => (s || '').replace(/\D/g, '');

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 3) {
    return NextResponse.json({ clientes: [] });
  }

  const usuarios = await getSheetData('USUARIOS');
  const termino = q.toLowerCase();
  const terminoDigitos = soloDigitos(q);

  const coincide = (u: Record<string, string>) => {
    if ((u.Activo || '').toLowerCase() === 'no') return false;
    const porNombre = (u.Nombre || '').toLowerCase().includes(termino);
    const porCodigo = (u.ID_Usuario || '').toLowerCase().includes(termino);
    // El teléfono solo se compara si el término trae dígitos suficientes
    const porTelefono =
      terminoDigitos.length >= 3 && soloDigitos(u.Telefono).includes(terminoDigitos);
    return porNombre || porCodigo || porTelefono;
  };

  const clientes = usuarios
    .filter(coincide)
    .slice(0, LIMITE)
    .map((u) => {
      const ciclo = parseInt(u.Ciclo_Actual) || 0;
      const beneficio = u.Beneficio_Disponible || 'Ninguno';
      return {
        id: u.ID_Usuario,
        nombre: u.Nombre || '',
        telefono: u.Telefono || '',
        ciclo,
        beneficio,
        // Cuánto le falta para el siguiente premio (para decírselo en caja)
        faltanParaDescuento: Math.max(0, META_DESCUENTO - ciclo),
        faltanParaArticulo: Math.max(0, META_ARTICULO - ciclo),
      };
    });

  return NextResponse.json({ clientes });
}
