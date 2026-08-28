/**
 * app/api/admin/biblioteca/route.ts
 *
 * CRUD del catálogo base de insumos (BibliotecaInsumo).
 *
 * GET   → lista con costo por unidad de receta ya calculado.
 * POST  → crea un insumo en la biblioteca y, por la relación 1:1, su
 *         InsumoActivo con stock 0.
 * PATCH → { id, accion: 'editar' | 'eliminar', datos? }
 *         Renombrar cascadea a la columna Ingrediente de Catalogo para
 *         no romper el vínculo receta↔insumo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { appendRow, getSheetData, updateCell, updateCells } from '@/lib/googleSheets';
import { normalizarNombre } from '@/lib/insumos';
import {
  clavesDeInsumo,
  COL_BIB,
  columnaEnUso,
  columnaIngredientes,
  columnaPrecioBase,
  columnaRendimiento,
  factorCrudo,
  escribirIngredientes,
  estaEnUso,
  HOJA_ACTIVOS,
  HOJA_BIBLIOTECA,
  leerIngredientes,
  prepararInventario,
} from '@/lib/inventario';
import { elegirPrecio, USAR_ULTIMA_COMPRA, type PresentacionPrecio } from '@/lib/precioInsumo';
import { leerPresentaciones } from '@/lib/presentaciones';
import { redondear } from '@/lib/inventario';
import { siguienteId } from '@/lib/ids';
import { getAdminSession } from '@/lib/roles';

/**
 * Insumos que cuentan: ni borrados ni renglones a medias.
 *
 * Una fila con ID pero sin nombre no es un insumo, es basura de la hoja;
 * salía como tarjeta en blanco que no se podía ni identificar ni borrar.
 */
const vivos = (filas: Record<string, string>[]) =>
  filas.filter(
    (b) =>
      (b.Eliminado || '').toLowerCase() !== 'si' && (b.Nombre || '').toString().trim() !== ''
  );

/**
 * Lee el rendimiento que viene del formulario.
 *
 * Devuelve `null` cuando el campo se dejó vacío —que es lo normal, casi
 * nada cambia de peso— y un mensaje cuando el número no tiene sentido.
 *
 * El tope de 1000 no es capricho: el arroz llega a 250 al cocerse, pero un
 * dedo de más en el teclado ("6670" por "66.7") multiplicaría el costo del
 * platillo por 66 y nadie lo notaría hasta ver el margen del mes.
 */
function leerRendimiento(valor: unknown): { pct: number | null } | { error: string } {
  const crudo = (valor ?? '').toString().trim();
  if (crudo === '') return { pct: null };
  const pct = parseFloat(crudo.replace(',', '.').replace('%', ''));
  if (isNaN(pct) || pct <= 0 || pct > 1000) {
    return { error: 'El rendimiento debe ser un porcentaje entre 1 y 1000, o quedar vacío.' };
  }
  return { pct };
}

/** Ingredientes distintos de Catalogo, con los productos que los usan. */
function ingredientesDelCatalogo(catalogo: Record<string, string>[]) {
  const mapa = new Map<string, { nombre: string; productos: Set<string> }>();
  for (const c of catalogo) {
    const nombre = (c.Ingrediente || '').toString().trim();
    if (!nombre) continue;
    // En Catalogo el encabezado del producto perdió la N inicial en algún
    // momento; se aceptan las dos formas.
    const producto = (c['Nombre_Producto'] || c['ombre_Producto'] || '').toString().trim();
    const clave = normalizarNombre(nombre);
    if (!mapa.has(clave)) mapa.set(clave, { nombre, productos: new Set() });
    if (producto) mapa.get(clave)!.productos.add(producto);
  }
  return mapa;
}

export async function GET(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const [biblioteca, catalogo, activos, presentaciones] = await Promise.all([
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    getSheetData('Catalogo'),
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
    leerPresentaciones(),
  ]);

  const presPorBib = new Map<string, PresentacionPrecio[]>();
  for (const p of presentaciones) {
    if (!presPorBib.has(p.idBiblioteca)) presPorBib.set(p.idBiblioteca, []);
    presPorBib.get(p.idBiblioteca)!.push(p);
  }

  const porIngrediente = ingredientesDelCatalogo(catalogo);

  // ── Productos con su receta, para el modal de vinculación ──
  if (new URL(req.url).searchParams.get('ingredientes')) {
    // Qué insumo reclama ya cada ingrediente, para no duplicar descuentos
    const dueño = new Map<string, string>();
    for (const b of vivos(biblioteca)) {
      if (leerIngredientes(b.Ingredientes).length === 0) continue;
      for (const clave of clavesDeInsumo(b)) dueño.set(clave, b.Nombre || '');
    }

    const catalogoProductos = await getSheetData('Productos');
    // Receta por producto, sin repetir ingredientes dentro del mismo
    const recetaPorProducto = new Map<string, Map<string, Record<string, string>>>();
    for (const c of catalogo) {
      const idProd = (c.ID_Producto || '').trim();
      const nombre = (c.Ingrediente || '').trim();
      if (!idProd || !nombre) continue;
      if (!recetaPorProducto.has(idProd)) recetaPorProducto.set(idProd, new Map());
      recetaPorProducto.get(idProd)!.set(normalizarNombre(nombre), c);
    }

    const productos = catalogoProductos
      .filter((p) => (p.Eliminado || '').toLowerCase() !== 'si' && p.ID_Producto)
      .map((p) => ({
        id: p.ID_Producto,
        nombre: p.Nombre || '',
        categoria: p['Categoría'] || p.Categoria || '',
        disponible: (p.Disponible || '').toString().toUpperCase() !== 'FALSE',
        ingredientes: [...(recetaPorProducto.get(p.ID_Producto)?.values() ?? [])].map((c) => ({
          nombre: (c.Ingrediente || '').trim(),
          cantidad: c.Cantidad_Receta || '',
          unidad: c.Unidad || '',
          vinculadoA: dueño.get(normalizarNombre(c.Ingrediente)) ?? '',
        })),
      }));

    return NextResponse.json({ productos });
  }

  // Relación 1:1 — para saber si el insumo se está usando hoy
  const activoPorBib = new Map(activos.map((a) => [a.ID_Biblioteca, a]));

  const items = vivos(biblioteca).map((b) => {
    const equivalencia = parseFloat(b.Equivalencia) || 1;
    const ultimoPrecio = parseFloat(b.Ultimo_Precio_Compra) || 0;
    const ingredientes = leerIngredientes(b.Ingredientes);

    // Productos alcanzados por este insumo, vía vínculo manual o por nombre
    const recetas = new Set<string>();
    for (const clave of clavesDeInsumo(b)) {
      for (const p of porIngrediente.get(clave)?.productos ?? []) recetas.add(p);
    }

    /*
      El costo sale del mismo lugar que en el recetario: de la
      presentación elegida, o de la más barata que se compre hoy. Tenerlo
      calculado en dos partes distintas es garantizar que un día la
      tarjeta del insumo y la receta digan números diferentes.
    */
    const precio = elegirPrecio(
      (b.Precio_Base ?? '').toString().trim(),
      presPorBib.get(b.ID_Biblioteca) ?? [],
      ultimoPrecio,
      equivalencia
    );
    const rendimientoPct = (b.Rendimiento_Pct ?? '').toString().trim();

    return {
      id: b.ID_Biblioteca || '',
      nombre: b.Nombre || '',
      unidadCompra: b.Unidad_Compra || '',
      unidadReceta: b.Unidad_Receta || '',
      equivalencia,
      ultimoPrecioCompra: ultimoPrecio,
      // Campos virtuales: no se almacenan, se calculan al leer
      costoPorUnidadReceta: precio.costoUnidad,
      /** De qué precio se está costeando, para poder verlo y cambiarlo */
      precioBase: (b.Precio_Base ?? '').toString().trim(),
      precioOrigen: precio.origen,
      precioEtiqueta: precio.etiqueta,
      precioAutomatico: precio.automatico,
      precioIdPresentacion: precio.idPresentacion,
      /** Cuánto queda de 100 al cocinar; '' para los que no cambian de peso */
      rendimientoPct,
      /** Lo que cuesta la unidad que llega al plato, ya con la conversión */
      costoPorUnidadServida:
        precio.costoUnidad === null
          ? null
          : redondear(precio.costoUnidad * factorCrudo(rendimientoPct), 4),
      categoria: b.Categoria || '',
      proveedor: b.Proveedor || '',
      contacto: b.Contacto_Proveedor || '',
      ingredientes,
      /** true = el vínculo es automático por nombre, no declarado a mano */
      vinculoAutomatico: ingredientes.length === 0,
      recetas: [...recetas].sort(),
      enUso: estaEnUso(activoPorBib.get(b.ID_Biblioteca)?.En_Uso),
    };
  });

  const categoriasEnUso = [...new Set(items.map((i) => i.categoria).filter(Boolean))];
  return NextResponse.json({ items, categoriasEnUso });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const {
    nombre,
    unidadCompra,
    unidadReceta,
    equivalencia,
    categoria,
    proveedor,
    contacto,
    rendimientoPct,
  } = await req.json();

  if (!nombre || !nombre.toString().trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const equiv = parseFloat(equivalencia);
  if (isNaN(equiv) || equiv <= 0) {
    return NextResponse.json(
      { error: 'La equivalencia debe ser mayor a 0 (ej. 1 Litro = 1000 ml)' },
      { status: 400 }
    );
  }
  const rendimiento = leerRendimiento(rendimientoPct);
  if ('error' in rendimiento) {
    return NextResponse.json({ error: rendimiento.error }, { status: 400 });
  }

  const [biblioteca, activos] = await Promise.all([
    getSheetData(HOJA_BIBLIOTECA),
    getSheetData(HOJA_ACTIVOS),
  ]);

  // Las recetas se unen por nombre: un duplicado partiría el consumo
  const clave = normalizarNombre(nombre);
  if (biblioteca.some((b) => normalizarNombre(b.Nombre) === clave)) {
    return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 400 });
  }

  const idBib = siguienteId(biblioteca, 'ID_Biblioteca', 'BIB');
  await appendRow(HOJA_BIBLIOTECA, [
    idBib,
    nombre.toString().trim(),
    (unidadCompra || '').toString().trim(),
    (unidadReceta || '').toString().trim(),
    equiv,
    '', // Ultimo_Precio_Compra — se llena con la primera compra
    (categoria || '').toString().trim().slice(0, 40),
    (proveedor || '').toString().trim(),
    (contacto || '').toString().trim(),
    '',
  ]);

  /*
    El rendimiento se escribe aparte y no en el appendRow de arriba: su
    columna se resuelve por nombre porque no está en la misma posición en
    todas las hojas —esta es anterior a la columna— y meterlo en el arreglo
    fijo lo pondría encima de la celda de al lado.
  */
  if (rendimiento.pct !== null) {
    const fila = biblioteca.length + 2; // +1 encabezado, +1 la que se acaba de agregar
    await updateCell(HOJA_BIBLIOTECA, fila, await columnaRendimiento(), rendimiento.pct);
  }

  // Relación 1:1 — cada insumo de biblioteca nace con su registro activo
  const idAct = siguienteId(activos, 'ID_Activo', 'ACT');
  await appendRow(HOJA_ACTIVOS, [idAct, idBib, 0, '', 'Fresco', '', '', 'si']);

  return NextResponse.json({ success: true, id: idBib });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararInventario();

  const { id, accion, datos, ingredientes } = await req.json();
  if (!id || !['editar', 'eliminar', 'ingredientes', 'precioBase'].includes(accion)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const [biblioteca, activos] = await Promise.all([
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
  ]);
  const idx = biblioteca.findIndex((b) => b.ID_Biblioteca === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });
  }
  const fila = idx + 2; // +1 encabezado, +1 base 1
  const actual = biblioteca[idx];

  // ── Vínculo manual con los ingredientes de las recetas ──
  if (accion === 'ingredientes') {
    if (!Array.isArray(ingredientes)) {
      return NextResponse.json({ error: 'Lista inválida' }, { status: 400 });
    }
    await updateCell(
      HOJA_BIBLIOTECA,
      fila,
      await columnaIngredientes(),
      escribirIngredientes(ingredientes.map(String))
    );
    return NextResponse.json({ success: true });
  }

  /*
    De qué presentación se costea este insumo. Va aparte de 'editar'
    porque se cambia desde el recetario, donde no hay formulario del
    insumo: mandar ahí todos los campos obligaría a la pantalla a conocer
    datos que no está mostrando, y un campo que llegue vacío borraría el
    que ya estaba.
  */
  if (accion === 'precioBase') {
    const elegido = (datos?.precioBase ?? '').toString().trim();
    if (elegido && elegido !== USAR_ULTIMA_COMPRA && !/^PRE-\d+$/.test(elegido)) {
      return NextResponse.json({ error: 'Presentación inválida' }, { status: 400 });
    }
    await updateCell(HOJA_BIBLIOTECA, fila, await columnaPrecioBase(), elegido);
    await anotar(
      sesion.user?.name || sesion.user?.email || '',
      'Insumos',
      `Cambió de qué precio se costea ${actual.Nombre || id}`,
      elegido || 'el más barato'
    );
    return NextResponse.json({ success: true });
  }

  if (accion === 'eliminar') {
    // Baja lógica: la fila se conserva para no romper recetas ni historial
    await updateCell(HOJA_BIBLIOTECA, fila, COL_BIB.eliminado, 'si');

    // Y su registro de inventario se retira también. Antes se quedaba vivo
    // apuntando a un insumo borrado: no se veía en el panel, pero seguía
    // guardando existencia que ya no se podía contar ni corregir.
    const filaAct = activos.findIndex((a) => a.ID_Biblioteca === id);
    if (filaAct !== -1) {
      await updateCell(HOJA_ACTIVOS, filaAct + 2, await columnaEnUso(), 'no');
    }
    return NextResponse.json({ success: true });
  }

  // ── editar ──
  const nombreNuevo = (datos?.nombre || '').toString().trim();
  if (!nombreNuevo) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
  }
  const equiv = parseFloat(datos?.equivalencia);
  if (isNaN(equiv) || equiv <= 0) {
    return NextResponse.json({ error: 'Equivalencia inválida' }, { status: 400 });
  }

  const claveNueva = normalizarNombre(nombreNuevo);
  if (biblioteca.some((b, k) => k !== idx && normalizarNombre(b.Nombre) === claveNueva)) {
    return NextResponse.json({ error: 'Ya existe otro insumo con ese nombre' }, { status: 400 });
  }

  // Todas las celdas del insumo en UN solo viaje a Google (antes eran
  // ~8 seguidos y por eso tardaba/se colgaba al guardar)
  const cambios: Record<number, string | number> = {
    [COL_BIB.nombre]: nombreNuevo,
    [COL_BIB.unidadCompra]: (datos?.unidadCompra || '').toString().trim(),
    [COL_BIB.unidadReceta]: (datos?.unidadReceta || '').toString().trim(),
    [COL_BIB.equivalencia]: equiv,
    [COL_BIB.categoria]: (datos?.categoria || '').toString().trim().slice(0, 40),
    [COL_BIB.proveedor]: (datos?.proveedor || '').toString().trim(),
    [COL_BIB.contacto]: (datos?.contacto || '').toString().trim(),
  };

  /*
    Se valida antes de tocar la hoja: si el rendimiento viniera mal y se
    revisara después, el insumo ya se habría guardado a medias — con el
    nombre nuevo y el rendimiento viejo.
  */
  const rendimiento = leerRendimiento(datos?.rendimientoPct);
  if ('error' in rendimiento) {
    return NextResponse.json({ error: rendimiento.error }, { status: 400 });
  }

  // Corregir un precio mal capturado sin tener que inventar una compra
  if (datos?.ultimoPrecioCompra !== undefined && datos.ultimoPrecioCompra !== '') {
    const precio = parseFloat(datos.ultimoPrecioCompra);
    if (isNaN(precio) || precio < 0) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }
    cambios[COL_BIB.ultimoPrecio] = precio;
  }

  await updateCells(HOJA_BIBLIOTECA, fila, cambios);

  /*
    El rendimiento va aparte de `cambios` porque su columna se resuelve por
    nombre: la hoja es anterior a esta función y en varias instalaciones la
    columna no está en la misma posición. Escribir por número fijo aquí
    machacaría la celda de al lado.

    Se manda como número —no como texto— a propósito: la hoja está en
    español y Google lee "66.7" escrito como cadena y lo guarda como una
    fecha de julio.
  */
  if (datos?.rendimientoPct !== undefined) {
    const leido = rendimiento;
    const antes = (actual.Rendimiento_Pct ?? '').toString().trim();
    const ahora = leido.pct === null ? '' : String(leido.pct);
    // Solo se escribe si de verdad cambió: casi ningún insumo usa este
    // campo, y sin esta guarda cada guardado gastaría un viaje a Google
    // para volver a poner la misma celda vacía.
    if (antes !== ahora) {
      await updateCell(
        HOJA_BIBLIOTECA,
        fila,
        await columnaRendimiento(),
        leido.pct === null ? '' : leido.pct
      );
    }
  }

  // Cascada del nombre a las recetas (Ingrediente = columna C en Catalogo)
  const nombreViejo = (actual.Nombre || '').toString().trim();
  if (normalizarNombre(nombreViejo) !== claveNueva) {
    const catalogo = await getSheetData('Catalogo');
    const claveVieja = normalizarNombre(nombreViejo);
    for (let k = 0; k < catalogo.length; k++) {
      if (normalizarNombre(catalogo[k].Ingrediente) === claveVieja) {
        await updateCell('Catalogo', k + 2, 3, nombreNuevo);
      }
    }
  }

  return NextResponse.json({ success: true });
}
