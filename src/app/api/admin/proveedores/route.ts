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
import { fechaDeCelda, parsearFechaHora } from '@/lib/pedidoFecha';
import { leerPresentaciones } from '@/lib/presentaciones';
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

  const [proveedores, compras, biblioteca, presentaciones] = await Promise.all([
    leerProveedores(),
    getSheetData(HOJA_COMPRAS, { crudo: true }).catch(() => []),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }).catch(() => []),
    leerPresentaciones().catch(() => []),
  ]);

  const nombrePorId = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const nombreInsumo = new Map(biblioteca.map((b) => [b.ID_Biblioteca, (b.Nombre || '').trim()]));
  // La unidad de receta, para poder decir "$0.30 la pieza" y no solo "$0.30"
  const unidadInsumo = new Map(
    biblioteca.map((b) => [b.ID_Biblioteca, (b.Unidad_Receta || '').trim()])
  );
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

    /**
     * Qué insumos le compras.
     *
     * Sale de dos lados: de lo que ya le compraste, y de las
     * presentaciones que declaraste que se consiguen con él. Lo segundo
     * permite anotar "aquí venden esto" antes de la primera compra, que
     * es justo cuando sirve para decidir a dónde ir.
     */
    const declarados = presentaciones
      .filter((x) => x.idProveedor === p.id)
      .map((x) => x.idBiblioteca);
    const insumos = [
      ...new Set(
        [...suyas.map((c) => (c.ID_Biblioteca || '').trim()), ...declarados].filter(Boolean)
      ),
    ].map((idBib) => {
      const opciones = porInsumo.get(idBib) ?? [];
      const mio = opciones.find((o) => (o.idProveedor || normalizar(o.proveedor)) === (p.id || normalizar(p.nombre)))
        ?? opciones.find((o) => normalizar(o.proveedor) === normalizar(p.nombre));
      // Sin compra todavía, vale el precio que se declaró en la presentación
      const suPres =
        presentaciones.find((x) => x.idProveedor === p.id && x.idBiblioteca === idBib && x.activa) ??
        presentaciones.find((x) => x.idProveedor === p.id && x.idBiblioteca === idBib);
      return {
        id: idBib,
        nombre: nombreInsumo.get(idBib) ?? idBib,
        porUnidad: mio?.porUnidad ?? suPres?.porUnidad ?? 0,
        precioPaquete: mio?.precioPaquete ?? suPres?.ultimoPrecio ?? 0,
        contenido: mio?.contenido ?? suPres?.contenido ?? 0,
        marca: suPres?.marca ?? '',
        /**
         * Cuándo se anotó ese precio. Sin esto no se puede saber si el
         * precio sirve: uno de hace cuatro meses es una suposición, y
         * comparar contra él lleva a ir al lugar equivocado.
         *
         * Vale más la fecha de la presentación que la de la última compra:
         * la presentación se actualiza también cuando solo se fue a
         * preguntar el precio, sin comprar.
         */
        fechaPrecio: suPres?.fechaPrecio || fechaDeCelda(mio?.ultimaFecha ?? ''),
        /** La presentación de este proveedor, para poder editarla o borrarla */
        idPresentacion: suPres?.id ?? '',
        unidadCompra: suPres?.unidadCompra ?? '',
        activa: suPres?.activa ?? true,
        /** true = todavía no se le ha comprado; el precio es el declarado */
        soloDeclarado: !mio,
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
      unidad: unidadInsumo.get(idBib) ?? '',
      /**
       * La fecha se normaliza aquí: en la hoja puede venir como texto o
       * como número de serie de Google, y la pantalla necesita YYYY-MM-DD
       * para poder decir de cuándo es cada precio. Comparar dos precios
       * sin saber sus fechas es justo lo que manda al lugar equivocado.
       */
      opciones: lista.map((o) => ({ ...o, ultimaFecha: fechaDeCelda(o.ultimaFecha) })),
      /** Cuánto te ahorras yendo con el más barato, POR UNIDAD DE RECETA */
      ahorro:
        Math.round(
          (Math.max(...lista.map((x) => x.porUnidad)) -
            Math.min(...lista.map((x) => x.porUnidad))) * 10000
        ) / 10000,
    }))
    .sort((a, b) => b.ahorro - a.ahorro);

  // El catálogo, para poder decir "aquí venden esto" sin salir de la pantalla
  const catalogo = biblioteca
    .filter(
      (b) =>
        b.ID_Biblioteca &&
        (b.Nombre || '').trim() &&
        (b.Eliminado || '').toLowerCase() !== 'si'
    )
    .map((b) => ({
      id: b.ID_Biblioteca,
      nombre: (b.Nombre || '').trim(),
      unidadReceta: (b.Unidad_Receta || '').trim(),
      unidadCompra: (b.Unidad_Compra || '').trim(),
      equivalencia: parseFloat(b.Equivalencia) || 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return NextResponse.json({ proveedores: resumen, comparables, catalogo });
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { nombre, contacto, telefono, notas, direccion } = await req.json();
  const limpio = (nombre ?? '').toString().trim();
  if (!limpio) {
    return NextResponse.json({ error: 'Escribe el nombre del proveedor' }, { status: 400 });
  }

  const id = await idDeProveedor(limpio, quienDe(sesion));
  if (contacto || telefono || notas || direccion) {
    await guardarProveedor(id, { contacto, telefono, notas, direccion });
  }
  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id, nombre, contacto, telefono, notas, activo, direccion } = await req.json();
  if (!id) return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 });

  if (nombre !== undefined && !(nombre ?? '').toString().trim()) {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
  }

  try {
    await guardarProveedor(id, { nombre, contacto, telefono, notas, activo, direccion });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
  await anotar(quienDe(sesion), 'Insumos', `Editó al proveedor ${nombre || id}`);
  return NextResponse.json({ success: true });
}
