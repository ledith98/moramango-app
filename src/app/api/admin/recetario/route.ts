/**
 * app/api/admin/recetario/route.ts
 *
 * Editor de recetas: qué insumo y cuánto lleva cada producto.
 *
 * GET    → productos con su receta ya resuelta (nombre, unidad y costo
 *          salen del insumo, no se guardan) + insumos disponibles
 * POST   → agrega un insumo a la receta de un producto
 * PATCH  → cambia la cantidad o la merma de un renglón, reordena los
 *          renglones, esconde del recetario un producto que ya no se
 *          prepara, o crea, renombra y borra un grupo de productos
 * DELETE → quita un renglón de la receta
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendRow, ensureColumn, getSheetData, updateCeldas, updateCell, updateCells } from '@/lib/googleSheets';
import { factorMerma } from '@/lib/insumos';
import {
  estaEnUso,
  factorCrudo,
  HOJA_ACTIVOS,
  HOJA_BIBLIOTECA,
  prepararInventario,
  redondear,
} from '@/lib/inventario';
import { elegirPrecio, nombrarPresentacion, type PresentacionPrecio } from '@/lib/precioInsumo';
import { leerPresentaciones } from '@/lib/presentaciones';
import { COL_REC, HOJA_RECETARIO, prepararRecetario } from '@/lib/recetario';
import { siguienteId } from '@/lib/ids';
import { anotar } from '@/lib/bitacora';
import { getAdminSession } from '@/lib/roles';
import { parsearFechaHora } from '@/lib/pedidoFecha';
import { guardarOrdenCategorias, leerAjustes } from '@/lib/ajustes';
import { claveCategoria } from '@/lib/categorias';

const vivos = (filas: Record<string, string>[]) =>
  filas.filter((b) => (b.Eliminado || '').toLowerCase() !== 'si');

const quienDe = (x: { user?: { name?: string | null; email?: string | null } } | null) =>
  x?.user?.name || x?.user?.email || '';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await Promise.all([prepararInventario(), prepararRecetario()]);

  const [recetario, biblioteca, productos, presentaciones, ajustes, activos, pedidos, detalles] =
    await Promise.all([
    getSheetData(HOJA_RECETARIO, { crudo: true }),
    getSheetData(HOJA_BIBLIOTECA, { crudo: true }),
    getSheetData('Productos', { crudo: true }),
    leerPresentaciones(),
    leerAjustes(),
    getSheetData(HOJA_ACTIVOS, { crudo: true }),
    getSheetData('PEDIDOS'),
    getSheetData('DT PEDIDOS'),
  ]);

  /*
    Cuántos productos se vendieron en los últimos 30 días con venta.

    Es el divisor de la renta: $8,700 entre 298 productos son $29 que le
    tocan a cada uno. Se cuentan días CON venta y no días de calendario,
    porque un puente sin abrir no debería abaratar la renta.
  */
  const fechaDePedido = new Map(
    pedidos
      .filter((x) => x.Estado !== 'Cancelado' && x.ID_Pedido)
      .map((x) => [x.ID_Pedido, parsearFechaHora(x.Fecha_Hora)?.fechaISO ?? ''])
  );
  const diasConVenta = [...new Set([...fechaDePedido.values()].filter(Boolean))].sort();
  const desde = diasConVenta.slice(-30)[0] ?? '';
  const unidadesMes = detalles.reduce((suma, d) => {
    const f = fechaDePedido.get(d.ID_Pedido);
    return f && f >= desde ? suma + (parseInt(d.Cantidad) || 0) : suma;
  }, 0);
  // Qué insumos están en la operación de hoy: los guardados no estorban
  // en la lista para elegir, pero siguen existiendo.
  const enUsoPorBib = new Map(activos.map((a) => [a.ID_Biblioteca, estaEnUso(a.En_Uso)]));

  const bibPorId = new Map(vivos(biblioteca).map((b) => [b.ID_Biblioteca, b]));

  const presPorBib = new Map<string, PresentacionPrecio[]>();
  for (const p of presentaciones) {
    if (!presPorBib.has(p.idBiblioteca)) presPorBib.set(p.idBiblioteca, []);
    presPorBib.get(p.idBiblioteca)!.push(p);
  }

  /**
   * De qué precio se costea este insumo, y de dónde salió.
   *
   * El precio vive en las presentaciones —es donde se anota lo que
   * realmente se pagó— y no en el número suelto del insumo, que se queda
   * viejo en cuanto cambia la forma de comprarlo.
   */
  function precioDe(idBiblioteca: string) {
    const bib = bibPorId.get(idBiblioteca);
    if (!bib) return null;
    return elegirPrecio(
      (bib.Precio_Base ?? '').toString().trim(),
      presPorBib.get(idBiblioteca) ?? [],
      parseFloat(bib.Ultimo_Precio_Compra ?? '') || 0,
      parseFloat(bib.Equivalencia ?? '') || 1
    );
  }
  const prodPorId = new Map(productos.map((p) => [p.ID_Producto, p]));

  const lineasPorProducto = new Map<string, Record<string, string>[]>();
  for (const r of recetario) {
    if (!r.ID_Producto) continue;
    if (!lineasPorProducto.has(r.ID_Producto)) lineasPorProducto.set(r.ID_Producto, []);
    lineasPorProducto.get(r.ID_Producto)!.push(r);
  }
  /*
    El orden que se haya puesto a mano manda; lo que nunca se ordenó se
    queda como se capturó. Sin el respaldo por posición, una receta a
    medio ordenar saltaría de lugar cada vez que se abre.
  */
  for (const lista of lineasPorProducto.values()) {
    lista.sort((a, b) => {
      const oa = parseFloat(a.Orden ?? '');
      const ob = parseFloat(b.Orden ?? '');
      if (isNaN(oa) && isNaN(ob)) return 0;
      if (isNaN(oa)) return 1;
      if (isNaN(ob)) return -1;
      return oa - ob;
    });
  }

  /**
   * Lo que cuesta un insumo por unidad SERVIDA, según su última compra.
   *
   * Servida y no comprada: el pollo se compra crudo y la receta lo pide
   * cocido, así que el kilo que llega al plato cuesta más que el que se
   * pagó. Los insumos que no cambian de peso —casi todos— no declaran
   * rendimiento y esto devuelve el costo de siempre.
   */
  function costoDeInsumo(idBiblioteca: string): number | null {
    const bib = bibPorId.get(idBiblioteca);
    const precio = precioDe(idBiblioteca);
    if (!bib || !precio || precio.costoUnidad === null) return null;
    return redondear(precio.costoUnidad * factorCrudo(bib.Rendimiento_Pct), 4);
  }

  /**
   * Lo que cuesta preparar un producto.
   *
   * Un combo se declara como "un sándwich + un jugo", así que su costo es
   * la suma de lo que cuesta cada uno — y si mañana cambia la receta del
   * sándwich, el combo se actualiza solo.
   *
   * Devuelve null si falta algún precio: un costo a medias engaña más de
   * lo que ayuda, porque el margen saldría mejor de lo que es.
   */
  function costoDeProducto(idProducto: string, visitados = new Set<string>()): number | null {
    // Referencia circular (alguien puso que el combo se lleva a sí mismo)
    if (visitados.has(idProducto) || visitados.size > 4) return null;
    const propios = new Set(visitados);
    propios.add(idProducto);

    const lineas = lineasPorProducto.get(idProducto) ?? [];
    if (lineas.length === 0) return null;

    let total = 0;
    for (const r of lineas) {
      const cantidad = parseFloat(r.Cantidad) || 0;
      // Los renglones que dependen de un extra no van en el costo base:
      // el producto sin ese extra no los lleva, y sumarlos haría ver más
      // caro de lo que cuesta lo que se vende casi siempre.
      if ((r.Extra_Requerido || '').trim()) continue;
      if (r.ID_Componente) {
        const costoComp = costoDeProducto(r.ID_Componente, propios);
        if (costoComp === null) return null;
        total += cantidad * costoComp;
      } else {
        const unitario = costoDeInsumo(r.ID_Biblioteca);
        if (unitario === null) return null;
        total += cantidad * factorMerma(r.Merma_Pct) * unitario;
      }
    }
    return redondear(total, 2);
  }

  const items = productos
    .filter((p) => p.ID_Producto && (p.Eliminado || '').toUpperCase() !== 'TRUE')
    .map((p) => {
      const lineas = (lineasPorProducto.get(p.ID_Producto) ?? []).map((r) => {
        const cantidad = parseFloat(r.Cantidad) || 0;

        // Renglón que apunta a otro producto: así se arman los combos
        if (r.ID_Componente) {
          const comp = prodPorId.get(r.ID_Componente);
          const costoComp = costoDeProducto(r.ID_Componente, new Set([p.ID_Producto]));
          return {
            id: r.ID_Linea,
            tipo: 'producto' as const,
            idBiblioteca: '',
            idComponente: r.ID_Componente,
            insumo: comp?.Nombre ?? '(producto eliminado)',
            unidad: cantidad === 1 ? 'pieza' : 'piezas',
            cantidad,
            merma: '',
            nota: r.Notas || '',
            costo: costoComp !== null ? redondear(cantidad * costoComp, 2) : null,
            huerfano: !comp,
          };
        }

        const bib = bibPorId.get(r.ID_Biblioteca);
        const costoUnidad = costoDeInsumo(r.ID_Biblioteca);
        /*
          Cuánto crudo hay que ocupar para servir esta cantidad.

          La receta dice 100 g de pollo porque es lo que se pesa en el
          plato, pero quien va a cocinar necesita saber que eso salen de
          150 g crudos. El dato ya está en el insumo; aquí solo se aplica
          a esta cantidad para no tener que sacar la cuenta a mano cada
          vez. Null en los insumos que no cambian de peso, que son casi
          todos.
        */
        const rendimiento = (bib?.Rendimiento_Pct ?? '').toString().trim();
        const factor = factorCrudo(rendimiento);
        const precio = precioDe(r.ID_Biblioteca);
        /*
          Las formas de comprar este insumo, para poder elegir con cuál se
          costea sin salir del recetario. Se mandan aunque haya una sola:
          ver "de aquí sale el precio" ya vale, y es la única manera de
          notar que el costo viene de una compra vieja.
        */
        const opciones = (presPorBib.get(r.ID_Biblioteca) ?? [])
          .filter((x) => x.porUnidad > 0)
          .sort((a, b) => a.porUnidad - b.porUnidad)
          .map((x) => ({
            id: x.id,
            etiqueta: nombrarPresentacion(x),
            porUnidad: redondear(x.porUnidad, 4),
            activa: x.activa,
          }));
        return {
          id: r.ID_Linea,
          tipo: 'insumo' as const,
          idBiblioteca: r.ID_Biblioteca,
          idComponente: '',
          // Nombre y unidad se resuelven al leer: renombrar un insumo
          // nunca rompe una receta, porque el vínculo es por ID
          insumo: bib?.Nombre ?? '(insumo eliminado)',
          unidad: bib?.Unidad_Receta ?? '',
          cantidad,
          /** De qué precio sale el costo de este renglón */
          precio: precio
            ? {
                origen: precio.origen,
                etiqueta: precio.etiqueta,
                automatico: precio.automatico,
                idPresentacion: precio.idPresentacion,
                porUnidad: precio.costoUnidad,
              }
            : null,
          /** Las formas de comprarlo, para poder cambiar de precio aquí */
          opcionesPrecio: opciones,
          /** Cuánto queda de 100 al cocinar; '' si no cambia de peso */
          rendimientoPct: rendimiento,
          /** Lo crudo que hay que ocupar para servir `cantidad` */
          cantidadCruda: rendimiento && factor !== 1 ? redondear(cantidad * factor, 3) : null,
          merma: r.Merma_Pct || '',
          nota: r.Notas || '',
          /** Si viene, este renglón solo cuenta cuando se pide ese extra */
          extraRequerido: (r.Extra_Requerido || '').trim(),
          // Costo real, calculado con la última compra registrada
          costo: costoUnidad !== null
            ? redondear(cantidad * factorMerma(r.Merma_Pct) * costoUnidad, 2)
            : null,
          huerfano: !bib,
        };
      });

      return {
        id: p.ID_Producto,
        nombre: p.Nombre || '',
        categoria: p['Categoría'] || p.Categoria || '',
        precio: parseFloat(p.Precio_Venta) || 0,
        emoji: (p.Emoji || '').trim(),
        lineas,
        costoTotal: costoDeProducto(p.ID_Producto),
        /** 'si' = ya no se prepara; se guarda su receta pero no estorba */
        oculta: (p.Receta_Oculta || '').toString().trim().toLowerCase() === 'si',
      };
    });

  const insumos = vivos(biblioteca)
    // Un renglón sin nombre no se puede elegir de una lista
    .filter((b) => (b.Nombre || '').trim())
    .map((b) => ({
      id: b.ID_Biblioteca,
      nombre: (b.Nombre || '').trim(),
      unidad: b.Unidad_Receta || '',
      categoria: b.Categoria || '',
      tienePrecio:
        (parseFloat(b.Ultimo_Precio_Compra) || 0) > 0 ||
        presentaciones.some((x) => x.idBiblioteca === b.ID_Biblioteca && x.ultimoPrecio > 0),
      /** false = guardado para después; no se ofrece salvo que se pidan */
      enUso: enUsoPorBib.get(b.ID_Biblioteca) ?? true,
    }));

  // Las tasas viajan con el recetario para que la pantalla pueda enseñar
  // el margen con y sin impuestos sin pedir los ajustes por separado.
  return NextResponse.json({
    items,
    insumos,
    impuestos: {
      ivaPct: ajustes.ivaPct,
      isrPct: ajustes.isrPct,
      gananciaPct: ajustes.gananciaPct,
    },
    /** Renta y servicios del mes, y entre cuántos productos se reparten */
    fijos: {
      alMes: ajustes.gastosFijosMes,
      unidadesMes,
      porProducto:
        ajustes.gastosFijosMes > 0 && unidadesMes > 0
          ? redondear(ajustes.gastosFijosMes / unidadesMes, 2)
          : 0,
    },
    // El mismo orden de grupos que la tienda, para que el recetario no
    // lleve los productos en otro orden que el menú
    ordenCategorias: ajustes.ordenCategorias,
    /*
      Todos los grupos que existen: los que usa algún producto y los que
      se crearon y todavía están vacíos. Sin los vacíos, un grupo recién
      creado desaparecería hasta meterle algo.
    */
    categorias: [
      ...new Set([
        ...ajustes.ordenCategorias,
        ...productos
          .filter((x) => (x.Eliminado || '').toUpperCase() !== 'TRUE')
          .map((x) => (x['Categoría'] || x.Categoria || '').toString().trim())
          .filter(Boolean),
      ]),
    ],
  });
}

export async function POST(req: NextRequest) {
  const sesionAlta = await getAdminSession();
  if (!sesionAlta) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const { idProducto, idBiblioteca, idComponente, cantidad } = await req.json();
  if (!idProducto || (!idBiblioteca && !idComponente)) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }
  const cant = parseFloat(cantidad);
  if (isNaN(cant) || cant <= 0) {
    return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
  }

  // Un producto no puede llevarse a sí mismo: el costo no terminaría de
  // calcularse nunca.
  if (idComponente && idComponente === idProducto) {
    return NextResponse.json(
      { error: 'Un producto no puede llevarse a sí mismo' },
      { status: 400 }
    );
  }

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });

  // Repetir el mismo renglón partiría el consumo en dos
  const yaEsta = recetario.some(
    (r) =>
      r.ID_Producto === idProducto &&
      (idComponente ? r.ID_Componente === idComponente : r.ID_Biblioteca === idBiblioteca)
  );
  if (yaEsta) {
    return NextResponse.json(
      {
        error: idComponente
          ? 'Ese producto ya está en el combo. Edita su cantidad.'
          : 'Ese insumo ya está en la receta. Edita su cantidad.',
      },
      { status: 400 }
    );
  }

  // Referencia circular en cadena: el combo A lleva B, y B ya lleva A.
  if (idComponente) {
    const porProducto = new Map<string, string[]>();
    for (const r of recetario) {
      if (!r.ID_Producto || !r.ID_Componente) continue;
      if (!porProducto.has(r.ID_Producto)) porProducto.set(r.ID_Producto, []);
      porProducto.get(r.ID_Producto)!.push(r.ID_Componente);
    }
    const alcanza = (desde: string, buscado: string, visto = new Set<string>()): boolean => {
      if (desde === buscado) return true;
      if (visto.has(desde)) return false;
      visto.add(desde);
      return (porProducto.get(desde) ?? []).some((h) => alcanza(h, buscado, visto));
    };
    if (alcanza(idComponente, idProducto)) {
      return NextResponse.json(
        { error: 'Eso haría un círculo: ese producto ya contiene a este' },
        { status: 400 }
      );
    }
  }

  const idLinea = siguienteId(recetario, 'ID_Linea', 'REC', 4);
  await appendRow(HOJA_RECETARIO, [
    idLinea,
    idProducto,
    idBiblioteca || '',
    cant,
    '',
    '',
    idComponente || '',
  ]);

  await anotar(
    quienDe(sesionAlta),
    'Recetario',
    `Agregó un ingrediente a una receta`,
    `producto ${idProducto} · ${idComponente ? `lleva ${idComponente}` : `insumo ${idBiblioteca}`} · cantidad ${cant}`
  );

  return NextResponse.json({ success: true, id: idLinea });
}

export async function PATCH(req: NextRequest) {
  const sesionEdit = await getAdminSession();
  if (!sesionEdit) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const { id, cantidad, merma, idProducto, oculta, orden, categoriaDe, categoriaA } =
    await req.json();

  /*
    Los grupos: crear uno (solo `categoriaA`), renombrarlo (los dos) o
    borrarlo (solo `categoriaDe`).

    Renombrar toca TODOS los productos de ese grupo y además el orden
    guardado en Ajustes; si solo se cambiara el orden, el grupo aparecería
    duplicado —el nombre viejo vacío y el nuevo al final.
  */
  if (categoriaDe !== undefined || categoriaA !== undefined) {
    const de = (categoriaDe ?? '').toString().trim();
    const a = (categoriaA ?? '').toString().trim().slice(0, 40);
    const { ordenCategorias } = await leerAjustes();
    const productos = await getSheetData('Productos', { crudo: true });
    const vivosProd = productos
      .map((x, i) => ({ x, fila: i + 2 }))
      .filter(({ x }) => x.ID_Producto && (x.Eliminado || '').toUpperCase() !== 'TRUE');
    const suyos = de
      ? vivosProd.filter(
          ({ x }) => claveCategoria((x['Categoría'] || x.Categoria || '').toString()) === claveCategoria(de)
        )
      : [];

    if (!de && !a) {
      return NextResponse.json({ error: 'Falta el nombre del grupo' }, { status: 400 });
    }
    // Crear: basta con dejarlo en el orden; nace vacío y esperando
    if (!de) {
      if (ordenCategorias.some((c) => claveCategoria(c) === claveCategoria(a))) {
        return NextResponse.json({ error: `"${a}" ya existe` }, { status: 400 });
      }
      await guardarOrdenCategorias([...ordenCategorias, a]);
      await anotar(quienDe(sesionEdit), 'Productos', `Creó el grupo "${a}"`, '');
      return NextResponse.json({ success: true });
    }
    // Borrar: solo si ya no le queda nada adentro
    if (!a) {
      if (suyos.length > 0) {
        return NextResponse.json(
          { error: `"${de}" todavía tiene ${suyos.length} producto(s). Muévelos antes de borrarlo.` },
          { status: 400 }
        );
      }
      await guardarOrdenCategorias(
        ordenCategorias.filter((c) => claveCategoria(c) !== claveCategoria(de))
      );
      await anotar(quienDe(sesionEdit), 'Productos', `Borró el grupo vacío "${de}"`, '');
      return NextResponse.json({ success: true });
    }
    // Renombrar
    if (
      claveCategoria(de) !== claveCategoria(a) &&
      ordenCategorias.some((c) => claveCategoria(c) === claveCategoria(a))
    ) {
      return NextResponse.json({ error: `"${a}" ya existe` }, { status: 400 });
    }
    if (suyos.length > 0) {
      await updateCeldas(
        'Productos',
        suyos.map(({ fila }) => ({ fila, col: 3, valor: a }))
      );
    }
    await guardarOrdenCategorias(
      ordenCategorias.some((c) => claveCategoria(c) === claveCategoria(de))
        ? ordenCategorias.map((c) => (claveCategoria(c) === claveCategoria(de) ? a : c))
        : [...ordenCategorias, a]
    );
    await anotar(
      quienDe(sesionEdit),
      'Productos',
      `Renombró el grupo "${de}" a "${a}"`,
      `${suyos.length} producto(s)`
    );
    return NextResponse.json({ success: true });
  }

  /*
    Reordenar los renglones de una receta. Llega la lista completa de
    ID_Linea en el orden nuevo y se numera 1, 2, 3…: mandar solo el
    renglón que se movió obligaría a adivinar dónde cae entre los demás.
  */
  if (Array.isArray(orden) && orden.length > 0) {
    await ensureColumn(HOJA_RECETARIO, 'Orden');
    const filas = await getSheetData(HOJA_RECETARIO, { crudo: true });
    const cambios = orden
      .map((idLinea: string, i: number) => {
        const idx = filas.findIndex((r) => r.ID_Linea === idLinea);
        return idx === -1
          ? null
          : { fila: idx + 2, col: COL_REC.orden as number, valor: i + 1 };
      })
      .filter((x): x is { fila: number; col: number; valor: number } => x !== null);
    if (cambios.length === 0) {
      return NextResponse.json({ error: 'No encontré esos renglones' }, { status: 404 });
    }
    await updateCeldas(HOJA_RECETARIO, cambios);
    return NextResponse.json({ success: true });
  }

  /*
    Esconder del recetario un producto que ya no se prepara.

    Va en su propia columna y NO en el 'Oculto' del menú: hay productos
    que se siguen vendiendo mientras se acaba la existencia y cuya receta
    ya no se toca, y al revés. Nada se borra: la receta queda guardada por
    si el producto regresa.
  */
  if (idProducto !== undefined) {
    const col = await ensureColumn('Productos', 'Receta_Oculta');
    const productos = await getSheetData('Productos', { crudo: true });
    const fila = productos.findIndex((x) => x.ID_Producto === idProducto);
    if (fila === -1) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }
    await updateCell('Productos', fila + 2, col, oculta ? 'si' : '');
    await anotar(
      quienDe(sesionEdit),
      'Recetario',
      oculta ? 'Escondió una receta que ya no se prepara' : 'Volvió a mostrar una receta',
      `${productos[fila].Nombre || idProducto}`
    );
    return NextResponse.json({ success: true });
  }

  if (!id) return NextResponse.json({ error: 'Falta el renglón' }, { status: 400 });

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });
  const idx = recetario.findIndex((r) => r.ID_Linea === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Renglón no encontrado' }, { status: 404 });
  }
  const fila = idx + 2;

  const cambios: Record<number, string | number> = {};
  if (cantidad !== undefined) {
    const cant = parseFloat(cantidad);
    if (isNaN(cant) || cant <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    }
    cambios[COL_REC.cantidad] = cant;
    // Al corregir la cantidad, el aviso de la migración ya no aplica
    cambios[COL_REC.notas] = '';
  }
  if (merma !== undefined) {
    cambios[COL_REC.merma] = (merma || '').toString().trim();
  }
  await updateCells(HOJA_RECETARIO, fila, cambios);

  await anotar(
    quienDe(sesionEdit),
    'Recetario',
    `Cambió un ingrediente (${id})`,
    [
      cantidad !== undefined ? `cantidad: ${recetario[idx].Cantidad} → ${cantidad}` : '',
      merma !== undefined ? `merma: ${recetario[idx].Merma_Pct || '0'} → ${merma || '0'}` : '',
      `producto ${recetario[idx].ID_Producto}`,
    ]
      .filter(Boolean)
      .join(' · ')
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const sesionBaja = await getAdminSession();
  if (!sesionBaja) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  await prepararRecetario();

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el renglón' }, { status: 400 });

  const recetario = await getSheetData(HOJA_RECETARIO, { crudo: true });
  const idx = recetario.findIndex((r) => r.ID_Linea === id);
  if (idx === -1) {
    return NextResponse.json({ error: 'Renglón no encontrado' }, { status: 404 });
  }

  // Se vacía la fila en vez de borrarla: eliminar filas recorrería todas
  // las de abajo y los índices que ya se leyeron dejarían de servir.
  const fila = idx + 2;
  await updateCells(HOJA_RECETARIO, fila, {
    [COL_REC.idProducto]: '',
    [COL_REC.idBiblioteca]: '',
    [COL_REC.cantidad]: '',
    [COL_REC.notas]: 'eliminado',
  });

  await anotar(
    quienDe(sesionBaja),
    'Recetario',
    `Quitó un ingrediente de una receta (${id})`,
    `era ${recetario[idx].Cantidad} de ${recetario[idx].ID_Biblioteca || recetario[idx].ID_Componente} en ${recetario[idx].ID_Producto}`
  );

  return NextResponse.json({ success: true });
}
