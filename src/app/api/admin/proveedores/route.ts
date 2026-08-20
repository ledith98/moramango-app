/**
 * app/api/admin/proveedores/route.ts
 *
 * Directorio de proveedores y comparación de precios.
 *
 * GET    → proveedores, con lo que se les compra y a cómo
 * POST   → alta { nombre, contacto?, telefono?, notas? }
 * PATCH  → edición { id, ...datos }
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { getSheetData } from '@/lib/googleSheets';
import { HOJA_BIBLIOTECA, HOJA_COMPRAS } from '@/lib/inventario';
import { parsearFechaHora } from '@/lib/pedidoFecha';
import {
  guardarProveedor,
  idDeProveedor,
  leerProveedores,
  normalizar,
  preciosPorInsumo,
} from '@/lib/proveedores';
import { getAdminSession } from '@/lib/roles';

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const [proveedores, compras, biblioteca] = await Promise.all([
    leerProveedores(),
    getSheetData(HOJA_COMPRAS, { crudo: true }).catch(() => []),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }).catch(() => []),
  ]);

  const nombrePorId = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const nombreInsumo = new Map(biblioteca.map((b) => [b.ID_Biblioteca, (b.Nombre || '').trim()]));
  const porInsumo = preciosPorInsumo(compras, nombrePorId);

  /**
   * A cada proveedor, qué se le compra. Sale del historial y no de una
   * lista declarada: una lista a mano se desactualiza y el historial no.
   * Se busca por ID o, para las compras viejas, por nombre normalizado.
   */
  const resumen = proveedores.map((p) => {
    const suyas = compras.filter((c) => {
      const porId = (c.ID_Proveedor || '').toString().trim();
      if (porId) return porId === p.id;
      return normalizar(c.Donde) === normalizar(p.nombre);
    });
    const gastado = suyas.reduce((s, c) => s + (parseFloat(c.Precio_Total) || 0), 0);
    const ultima = suyas
      .map((c) => parsearFechaHora(c.Fecha)?.fechaISO ?? '')
      .filter(Boolean)
      .sort()
      .pop();

    // Qué insumos, con su último precio y si es el más barato del mercado
    const insumos = [
      ...new Set(suyas.map((c) => (c.ID_Biblioteca || '').trim()).filter(Boolean)),
    ].map((idBib) => {
      const opciones = porInsumo.get(idBib) ?? [];
      const mio = opciones.find((o) => (o.idProveedor || normalizar(o.proveedor)) === (p.id || normalizar(p.nombre)))
        ?? opciones.find((o) => normalizar(o.proveedor) === normalizar(p.nombre));
      return {
        id: idBib,
        nombre: nombreInsumo.get(idBib) ?? idBib,
        ultimoPrecio: mio?.ultimoPrecio ?? 0,
        esElMasBarato: mio?.esElMasBarato ?? false,
        /** Cuántos proveedores distintos venden esto: sin al menos dos, no hay comparación */
        cuantosLoVenden: opciones.length,
      };
    });

    return {
      ...p,
      compras: suyas.length,
      gastado: Math.round(gastado * 100) / 100,
      ultimaCompra: ultima ?? '',
      insumos: insumos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
  });

  // Insumos que se compran en más de un lado: ahí está la comparación útil
  const comparables = [...porInsumo]
    .filter(([, l]) => l.length > 1)
    .map(([idBib, lista]) => ({
      id: idBib,
      nombre: nombreInsumo.get(idBib) ?? idBib,
      opciones: lista,
      /** Cuánto te ahorras yendo con el más barato, por unidad de compra */
      ahorro:
        Math.round((Math.max(...lista.map((x) => x.ultimoPrecio)) -
          Math.min(...lista.map((x) => x.ultimoPrecio))) * 100) / 100,
    }))
    .sort((a, b) => b.ahorro - a.ahorro);

  return NextResponse.json({ proveedores: resumen, comparables });
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { nombre, contacto, telefono, notas } = await req.json();
  const limpio = (nombre ?? '').toString().trim();
  if (!limpio) {
    return NextResponse.json({ error: 'Escribe el nombre del proveedor' }, { status: 400 });
  }

  const id = await idDeProveedor(limpio, quienDe(sesion));
  if (contacto || telefono || notas) {
    await guardarProveedor(id, { contacto, telefono, notas });
  }
  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id, nombre, contacto, telefono, notas, activo } = await req.json();
  if (!id) return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 });

  if (nombre !== undefined && !(nombre ?? '').toString().trim()) {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
  }

  try {
    await guardarProveedor(id, { nombre, contacto, telefono, notas, activo });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
  await anotar(quienDe(sesion), 'Insumos', `Editó al proveedor ${nombre || id}`);
  return NextResponse.json({ success: true });
}
