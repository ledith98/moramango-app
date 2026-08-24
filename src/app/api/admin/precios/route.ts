/**
 * app/api/admin/precios/route.ts
 *
 * El historial de precios de una presentación.
 *
 * GET    ?presentacion=PRE-0001  → toda la línea de tiempo
 * DELETE ?id=HIS-0001            → borra una anotación mal capturada
 *
 * Al borrar hay que recalcular cuál es el precio vigente. Sin eso, borrar
 * el más reciente dejaría a la presentación mostrando justo el precio que
 * se acaba de declarar equivocado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { getSheetData } from '@/lib/googleSheets';
import { borrarAnotacion, leerAnotaciones } from '@/lib/historialPrecios';
import { fechaDeCelda } from '@/lib/pedidoFecha';
import { armarHistorial, vigente } from '@/lib/precios';
import { HOJA_BIBLIOTECA, HOJA_COMPRAS } from '@/lib/inventario';
import { guardarPresentacion, leerPresentaciones } from '@/lib/presentaciones';
import { getAdminSession } from '@/lib/roles';

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

/** Reúne el historial de una presentación desde sus dos fuentes. */
async function historialDe(idPresentacion: string) {
  const presentaciones = await leerPresentaciones();
  const pres = presentaciones.find((p) => p.id === idPresentacion);
  if (!pres) return null;

  const [anotaciones, compras] = await Promise.all([
    leerAnotaciones(idPresentacion),
    getSheetData(HOJA_COMPRAS, { crudo: true }).catch(() => []),
  ]);
  return {
    pres,
    registros: armarHistorial(
      anotaciones,
      compras,
      idPresentacion,
      pres.idBiblioteca,
      pres.idProveedor,
      fechaDeCelda
    ),
  };
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('presentacion');
  if (!id) return NextResponse.json({ error: 'Falta la presentación' }, { status: 400 });

  const datos = await historialDe(id);
  if (!datos) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  const biblioteca = await getSheetData(HOJA_BIBLIOTECA, { crudo: true }).catch(() => []);
  const insumo = biblioteca.find((b) => b.ID_Biblioteca === datos.pres.idBiblioteca);

  return NextResponse.json({
    registros: datos.registros,
    nombre: (insumo?.Nombre || '').trim(),
    unidadReceta: (insumo?.Unidad_Receta || '').trim(),
    marca: datos.pres.marca,
    unidadCompra: datos.pres.unidadCompra,
  });
}

export async function DELETE(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const idPresentacion = url.searchParams.get('presentacion');
  if (!id || !idPresentacion) {
    return NextResponse.json({ error: 'Falta el registro' }, { status: 400 });
  }

  const borrado = await borrarAnotacion(id);
  if (!borrado) {
    return NextResponse.json({ error: 'Ese registro ya no existe' }, { status: 404 });
  }

  /**
   * Recalcular el precio vigente.
   *
   * Es la mitad del trabajo, no un extra: si se borró el registro más
   * reciente y no se recalcula, la presentación se queda mostrando el
   * precio que la persona acaba de decir que estaba mal.
   */
  const datos = await historialDe(idPresentacion);
  const ahora = datos ? vigente(datos.registros) : null;
  await guardarPresentacion(idPresentacion, {
    // Sin registros no queda precio: cero se guarda como vacío, para que
    // no aparezca como el proveedor más barato de todos
    ultimoPrecio: ahora ? ahora.precio : 0,
    fechaPrecio: ahora ? ahora.fecha : '',
  });

  await anotar(
    quienDe(sesion),
    'Insumos',
    `Borró un precio del historial (${id})`,
    ahora ? `Ahora vale el de ${ahora.fecha}: $${ahora.precio}` : 'No queda ningún precio anotado'
  );

  return NextResponse.json({
    success: true,
    vigente: ahora ? { precio: ahora.precio, fecha: ahora.fecha } : null,
  });
}
