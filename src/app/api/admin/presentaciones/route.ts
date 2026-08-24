/**
 * app/api/admin/presentaciones/route.ts
 *
 * Las formas en que se compra un insumo: marca, tamaño y precio.
 *
 * POST  → alta { idBiblioteca, marca, unidadCompra, contenido, proveedor? }
 * PATCH → edición { id, ...datos }
 *
 * No hay GET: las presentaciones viajan junto con los insumos, que es
 * donde se usan, y pedirlas aparte sería un viaje de más a Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { anotar } from '@/lib/bitacora';
import { appendRow, getSheetData } from '@/lib/googleSheets';
import { siguienteId } from '@/lib/ids';
import { normalizarNombre } from '@/lib/insumos';
import { HOJA_ACTIVOS, HOJA_BIBLIOTECA, HOJA_COMPRAS } from '@/lib/inventario';
import {
  borrarPresentacion,
  crearPresentacion,
  guardarPresentacion,
  leerPresentaciones,
} from '@/lib/presentaciones';
import { anotarEnHistorial } from '@/lib/historialPrecios';
import { idDeProveedor } from '@/lib/proveedores';
import { getAdminSession } from '@/lib/roles';

const quienDe = (s: { user?: { name?: string | null; email?: string | null } } | null) =>
  s?.user?.name || s?.user?.email || '';

/** El contenido es lo que hace comparable una presentación con otra. */
function revisarContenido(v: unknown): { ok: true; valor: number } | { ok: false; error: string } {
  const n = parseFloat((v ?? '').toString().replace(',', '.'));
  if (isNaN(n) || n <= 0) {
    return { ok: false, error: 'Escribe cuánto trae, en la unidad de las recetas' };
  }
  return { ok: true, valor: n };
}

export async function POST(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const {
    idBiblioteca,
    marca,
    unidadCompra,
    contenido,
    proveedor,
    ultimoPrecio,
    // Para dar de alta un insumo que todavía no existe, sin salir de aquí
    nombreNuevo,
    unidadReceta,
    categoria,
    // Cuándo se VIO ese precio: si el sábado preguntaste y lo anotas el
    // lunes, el precio es del sábado, no de hoy
    fechaPrecio,
  } = await req.json();

  const biblioteca = await getSheetData(HOJA_BIBLIOTECA, { crudo: true });

  /**
   * El insumo puede venir del catálogo o crearse en el momento.
   *
   * Anotar que un proveedor vende algo que todavía no está dado de alta es
   * lo que pasa al descubrirlo: se ve en la bodega y se quiere apuntar
   * antes de olvidarlo. Obligar a salir a Insumos primero hace que no se
   * apunte nunca.
   *
   * Nace SIN uso: es un candidato para una receta futura, no algo que
   * ya se esté ocupando, y meterlo a la operación diaria lo llenaría de
   * insumos en cero que nadie cuenta.
   */
  let idInsumo = (idBiblioteca ?? '').toString().trim();
  let insumo = biblioteca.find((b) => b.ID_Biblioteca === idInsumo);

  if (!idInsumo) {
    const nombre = (nombreNuevo ?? '').toString().trim();
    if (!nombre) {
      return NextResponse.json({ error: 'Falta el insumo' }, { status: 400 });
    }
    const clave = normalizarNombre(nombre);
    const repetido = biblioteca.find(
      (b) => normalizarNombre(b.Nombre) === clave && (b.Eliminado || '').toLowerCase() !== 'si'
    );
    if (repetido) {
      // Ya existe: se usa ese en vez de crear un duplicado, que es
      // justo el desorden que el catálogo evita.
      idInsumo = repetido.ID_Biblioteca;
      insumo = repetido;
    } else {
      const activos = await getSheetData(HOJA_ACTIVOS, { crudo: true });
      idInsumo = siguienteId(biblioteca, 'ID_Biblioteca', 'BIB');
      const idAct = siguienteId(activos, 'ID_Activo', 'ACT');
      const uReceta = (unidadReceta ?? '').toString().trim() || 'pieza';
      await appendRow(HOJA_BIBLIOTECA, [
        idInsumo,
        nombre,
        (unidadCompra ?? '').toString().trim(),
        uReceta,
        1,
        '',
        (categoria ?? '').toString().trim(),
        '',
        '',
        '',
        '',
        '',
      ]);
      await appendRow(HOJA_ACTIVOS, [idAct, idInsumo, 0, '', 'Fresco', '', '', 'no']);
      insumo = { ID_Biblioteca: idInsumo, Nombre: nombre, Unidad_Receta: uReceta };
      await anotar(
        quienDe(sesion),
        'Insumos',
        `Dio de alta "${nombre}" desde Proveedores`,
        'Nace guardado, sin usarse: es un candidato para una receta futura'
      );
    }
  }

  if (!insumo) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });
  }

  const r = revisarContenido(contenido);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // El proveedor se resuelve contra el directorio, igual que en la compra
  const idProveedor = (proveedor ?? '').toString().trim()
    ? await idDeProveedor((proveedor ?? '').toString(), quienDe(sesion))
    : '';

  const precio = parseFloat((ultimoPrecio ?? '').toString().replace(',', '.'));

  const id = await crearPresentacion({
    idBiblioteca: idInsumo,
    marca: (marca ?? '').toString(),
    unidadCompra: (unidadCompra ?? '').toString(),
    contenido: r.valor,
    ultimoPrecio: !isNaN(precio) && precio > 0 ? precio : undefined,
    idProveedor,
    fechaPrecio: (fechaPrecio ?? '').toString().trim() || undefined,
  });

  // Deja constancia del precio: sin esto, el próximo lo pisaría y no
  // habría cómo saber si subió ni cómo deshacer una captura mala
  await anotarEnHistorial({
    idPresentacion: id,
    idBiblioteca: idInsumo,
    precio: !isNaN(precio) ? precio : 0,
    contenido: r.valor,
    origen: 'anotado',
    quien: quienDe(sesion),
    fecha: (fechaPrecio ?? '').toString().trim() || undefined,
  });

  await anotar(
    quienDe(sesion),
    'Insumos',
    `Agregó una presentación de ${insumo.Nombre}`,
    `${(marca ?? '').toString().trim() || 'sin marca'} · ${unidadCompra || 'paquete'} de ${r.valor} ${insumo.Unidad_Receta || ''}`.trim()
  );

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id, marca, unidadCompra, contenido, proveedor, ultimoPrecio, activa, revisado, fechaPrecio } =
    await req.json();
  if (!id) return NextResponse.json({ error: 'Falta la presentación' }, { status: 400 });

  const todas = await leerPresentaciones();
  const actual = todas.find((p) => p.id === id);
  if (!actual) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  /**
   * "Fui, pregunté, y sigue costando lo mismo."
   *
   * Sin esto la fecha solo se refresca al CAMBIAR el precio, así que un
   * precio estable se ve cada vez más viejo aunque se confirme cada
   * semana — y termina marcado como dudoso justo el que más confianza
   * merece. Se reescribe el mismo precio para que la fecha viaje pegada
   * a él, como en cualquier otra actualización.
   */
  if (revisado) {
    if (!(actual.ultimoPrecio > 0)) {
      return NextResponse.json(
        { error: 'Esta presentación todavía no tiene precio anotado' },
        { status: 400 }
      );
    }
    await guardarPresentacion(id, {
      ultimoPrecio: actual.ultimoPrecio,
      fechaPrecio: (fechaPrecio ?? '').toString().trim() || undefined,
    });
    await anotarEnHistorial({
      idPresentacion: id,
      idBiblioteca: actual.idBiblioteca,
      precio: actual.ultimoPrecio,
      contenido: actual.contenido,
      origen: 'revisado',
      quien: quienDe(sesion),
      fecha: (fechaPrecio ?? '').toString().trim() || undefined,
    });
    await anotar(
      quienDe(sesion),
      'Insumos',
      `Revisó el precio de una presentación (${id})`,
      'sigue igual'
    );
    return NextResponse.json({ success: true });
  }

  const datos: Parameters<typeof guardarPresentacion>[1] = {};
  if (marca !== undefined) datos.marca = (marca ?? '').toString();
  if (unidadCompra !== undefined) datos.unidadCompra = (unidadCompra ?? '').toString();
  if (contenido !== undefined) {
    const r = revisarContenido(contenido);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    datos.contenido = r.valor;
  }
  if (ultimoPrecio !== undefined) {
    const n = parseFloat((ultimoPrecio ?? '').toString().replace(',', '.'));
    if (!isNaN(n) && n >= 0) datos.ultimoPrecio = n;
  }
  // La fecha en que se VIO el precio, que puede no ser la de captura: si
  // el sábado viste un precio y lo anotas el lunes, el precio es del sábado
  if ((fechaPrecio ?? '').toString().trim()) {
    datos.fechaPrecio = fechaPrecio.toString().trim();
  }
  if (proveedor !== undefined) {
    datos.idProveedor = (proveedor ?? '').toString().trim()
      ? await idDeProveedor((proveedor ?? '').toString(), quienDe(sesion))
      : '';
  }
  if (activa !== undefined) datos.activa = !!activa;

  try {
    await guardarPresentacion(id, datos);
  } catch (e) {
    // Sin esto, un fallo de Google (cuota, red) devolvía HTML y la pantalla
    // se quedaba en "Guardando…" para siempre, sin decir qué pasó.
    console.error('Error guardando la presentación:', e);
    return NextResponse.json(
      { error: 'No se pudo guardar. Vuelve a intentarlo en un momento.' },
      { status: 500 }
    );
  }
  // Solo si el precio cambió: reeditar la marca no es una observación
  if (datos.ultimoPrecio !== undefined && datos.ultimoPrecio !== actual.ultimoPrecio) {
    await anotarEnHistorial({
      idPresentacion: id,
      idBiblioteca: actual.idBiblioteca,
      precio: datos.ultimoPrecio,
      contenido: datos.contenido ?? actual.contenido,
      origen: 'anotado',
      quien: quienDe(sesion),
      fecha: (fechaPrecio ?? '').toString().trim() || undefined,
    });
  }
  await anotar(quienDe(sesion), 'Insumos', `Editó una presentación (${id})`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const sesion = await getAdminSession();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta la presentación' }, { status: 400 });

  const todas = await leerPresentaciones();
  const actual = todas.find((p) => p.id === id);
  if (!actual) return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 });

  /**
   * Con compras encima no se borra.
   *
   * Esas compras quedarían apuntando a la nada y se perdería su historial
   * de precios, que es lo que permite comparar proveedores. Para dejar de
   * usarla existe "ya no la compro así", que la esconde sin romper nada.
   */
  const compras = await getSheetData(HOJA_COMPRAS, { crudo: true }).catch(() => []);
  const cuantas = compras.filter((c) => (c.ID_Presentacion || '').toString().trim() === id).length;
  if (cuantas > 0) {
    return NextResponse.json(
      {
        error: `No se puede borrar: ya tiene ${cuantas} compra${cuantas === 1 ? '' : 's'} registrada${cuantas === 1 ? '' : 's'}. Usa "ya no la compro así" para dejar de verla, sin perder su historial de precios.`,
      },
      { status: 409 }
    );
  }

  await borrarPresentacion(id);
  await anotar(quienDe(sesion), 'Insumos', `Borró una presentación (${id})`, 'no tenía compras');
  return NextResponse.json({ success: true });
}
