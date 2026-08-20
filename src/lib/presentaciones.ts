/**
 * presentaciones.ts
 *
 * Las formas en que se compra un mismo insumo.
 *
 * El problema que resuelve: "Mayonesa" estaba registrada como "1 paquete
 * 2 kg". Cuando no hay y se compra un bote de 1.8 kg de otra marca, esa
 * compra no cabe en el registro — la unidad literalmente dice "paquete
 * 2 kg". Las salidas eran dos, y las dos malas: cambiar la equivalencia
 * del insumo (y descuadrar el costo de todas las recetas que lo usan) o
 * dar de alta otro insumo (y partir en dos el stock de algo que en la
 * cocina es una sola bolsa de gramos).
 *
 * La separación que lo arregla:
 *
 *   INSUMO        qué es y en qué lo piden las recetas — "Mayonesa", en g.
 *                 Aquí vive el STOCK: una sola bolsa de gramos.
 *   PRESENTACIÓN  cómo se compra — "Hellmann's, paquete de 2 kg" o
 *                 "tal marca, bote de 1.8 kg". Aquí viven la marca, el
 *                 contenido y el precio.
 *
 * Ojo con lo que NO es una presentación: un vaso de 16 oz y uno de 2 oz
 * son insumos distintos, no dos presentaciones del mismo. La prueba es la
 * receta: si un producto pide específicamente el de 2 oz, no son
 * intercambiables. La mayonesa sí lo es — la receta pide gramos y le da
 * igual de qué bote salieron.
 */

import { appendRow, ensureColumn, ensureSheet, getSheetData, updateCells } from './googleSheets';
import { siguienteId } from './ids';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';

export const HOJA_PRESENTACIONES = 'Presentaciones';
const COLS = [
  'ID_Presentacion',
  'ID_Biblioteca',
  'Marca',
  'Unidad_Compra',
  'Contenido',
  'Ultimo_Precio',
  'ID_Proveedor',
  'Activa',
  // Cuándo se anotó ese precio. Un precio sin fecha no se puede leer: no
  // se sabe si es de esta semana o de hace medio año, y comparar contra
  // uno viejo lleva a ir al lugar equivocado.
  'Fecha_Precio',
];

/** Columnas 1-based, para updateCells */
export const COL_PRES = {
  idBiblioteca: 2,
  marca: 3,
  unidadCompra: 4,
  contenido: 5,
  ultimoPrecio: 6,
  idProveedor: 7,
  activa: 8,
  fechaPrecio: 9,
} as const;

/** Para los insumos que no tienen marca (la fruta a granel, el hielo). */
export const SIN_MARCA = 'No aplica';

export interface Presentacion {
  id: string;
  idBiblioteca: string;
  marca: string;
  /** Cómo se compra: paquete, bote, caja… */
  unidadCompra: string;
  /** Cuántas unidades de receta trae: 2000 g, 1800 g, 40 pz */
  contenido: number;
  ultimoPrecio: number;
  idProveedor: string;
  activa: boolean;
  /** Cuándo se anotó ese precio (YYYY-MM-DD); vacío si nunca */
  fechaPrecio: string;
  /** Lo que cuesta la unidad de receta con esta presentación */
  porUnidad: number;
}

/** "Hellmann's · paquete de 2000 g" — cómo se lee en pantalla. */
export function describir(p: Presentacion, unidadReceta = ''): string {
  const marca = p.marca && p.marca !== SIN_MARCA ? `${p.marca} · ` : '';
  const cuanto = p.contenido > 0 ? ` de ${p.contenido}${unidadReceta ? ' ' + unidadReceta : ''}` : '';
  return `${marca}${p.unidadCompra || 'paquete'}${cuanto}`;
}

export async function prepararPresentaciones(): Promise<void> {
  await ensureSheet(HOJA_PRESENTACIONES, COLS);
  // ensureSheet solo escribe encabezados al CREAR la hoja
  await ensureColumn(HOJA_PRESENTACIONES, 'Activa');
  await ensureColumn(HOJA_PRESENTACIONES, 'Fecha_Precio');
}

export async function leerPresentaciones(): Promise<Presentacion[]> {
  try {
    const filas = await getSheetData(HOJA_PRESENTACIONES, { crudo: true });
    return filas
      .filter((f) => f.ID_Presentacion && f.ID_Biblioteca)
      .map((f) => {
        const contenido = parseFloat(f.Contenido) || 0;
        const precio = parseFloat(f.Ultimo_Precio) || 0;
        return {
          id: f.ID_Presentacion,
          idBiblioteca: f.ID_Biblioteca,
          marca: (f.Marca || '').toString().trim(),
          unidadCompra: (f.Unidad_Compra || '').toString().trim(),
          contenido,
          ultimoPrecio: precio,
          idProveedor: (f.ID_Proveedor || '').toString().trim(),
          // Vacío se lee como activa, para las que se creen sin la columna
          activa: (f.Activa || '').toString().trim().toLowerCase() !== 'no',
          fechaPrecio: fechaDeCelda(f.Fecha_Precio),
          // Lo único comparable entre presentaciones y entre proveedores
          porUnidad: contenido > 0 && precio > 0 ? precio / contenido : 0,
        };
      });
  } catch {
    // Todavía sin hoja: se crea sola con la primera presentación
    return [];
  }
}

export interface DatosPresentacion {
  idBiblioteca: string;
  marca?: string;
  unidadCompra?: string;
  contenido?: number;
  ultimoPrecio?: number;
  idProveedor?: string;
  activa?: boolean;
  fechaPrecio?: string;
}

/**
 * Un número, siempre como número.
 *
 * Sheets interpreta lo que se le manda según el idioma del archivo, y en
 * español "4.03" lo lee como el 4 de marzo: guardó 46085 en vez del
 * precio. Le pasó a cinco presentaciones. Mandando un number de verdad,
 * y nunca la cadena, no hay nada que interpretar.
 */
const comoNumero = (v: unknown): number | '' => {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(',', '.'));
  return isNaN(n) ? '' : n;
};

/** Da de alta una presentación y devuelve su ID. */
export async function crearPresentacion(datos: DatosPresentacion): Promise<string> {
  await prepararPresentaciones();
  const filas = await getSheetData(HOJA_PRESENTACIONES, { crudo: true });
  const id = siguienteId(filas, 'ID_Presentacion', 'PRE', 4);
  await appendRow(HOJA_PRESENTACIONES, [
    id,
    datos.idBiblioteca,
    (datos.marca ?? '').trim(),
    (datos.unidadCompra ?? '').trim(),
    comoNumero(datos.contenido),
    comoNumero(datos.ultimoPrecio),
    (datos.idProveedor ?? '').trim(),
    datos.activa === false ? 'no' : 'si',
    // Solo se fecha si viene precio: una presentación sin precio no tiene
    // qué fechar, y ponerle hoy haría creer que está al día.
    comoNumero(datos.ultimoPrecio) !== '' ? (datos.fechaPrecio ?? fechaHoyMTY()) : '',
  ]);
  return id;
}

export async function guardarPresentacion(
  id: string,
  datos: Partial<DatosPresentacion>
): Promise<void> {
  await prepararPresentaciones();
  const filas = await getSheetData(HOJA_PRESENTACIONES, { crudo: true });
  const i = filas.findIndex((f) => f.ID_Presentacion === id);
  if (i === -1) throw new Error('Presentación no encontrada');

  const cambios: Record<number, string | number> = {};
  if (datos.marca !== undefined) cambios[COL_PRES.marca] = datos.marca.trim();
  if (datos.unidadCompra !== undefined) cambios[COL_PRES.unidadCompra] = datos.unidadCompra.trim();
  if (datos.contenido !== undefined) cambios[COL_PRES.contenido] = comoNumero(datos.contenido);
  if (datos.ultimoPrecio !== undefined) cambios[COL_PRES.ultimoPrecio] = comoNumero(datos.ultimoPrecio);
  if (datos.idProveedor !== undefined) cambios[COL_PRES.idProveedor] = datos.idProveedor.trim();
  if (datos.activa !== undefined) cambios[COL_PRES.activa] = datos.activa ? 'si' : 'no';
  // La fecha viaja pegada al precio: cambiar uno sin el otro dejaría un
  // precio nuevo con fecha vieja, que es peor que no tener fecha.
  if (datos.ultimoPrecio !== undefined && comoNumero(datos.ultimoPrecio) !== '') {
    cambios[COL_PRES.fechaPrecio] = datos.fechaPrecio ?? fechaHoyMTY();
  }
  if (Object.keys(cambios).length > 0) {
    await updateCells(HOJA_PRESENTACIONES, i + 2, cambios);
  }
}

/**
 * Deja anotado lo que costó esta presentación la última vez.
 *
 * Se guarda en la presentación y no en el insumo: el precio de un bote de
 * 1.8 kg no dice nada del paquete de 2 kg, y guardarlos en el mismo lugar
 * es lo que hacía que el costo de las recetas bailara según la última
 * compra que se hubiera capturado.
 */
export async function anotarPrecio(
  id: string,
  precio: number,
  fechaISO?: string
): Promise<void> {
  if (!(precio > 0)) return;
  await guardarPresentacion(id, {
    ultimoPrecio: Math.round(precio * 100) / 100,
    // La fecha de la COMPRA, no la de captura: si se anota el lunes lo que
    // se compró el sábado, el precio es del sábado.
    fechaPrecio: fechaISO,
  });
}

/**
 * Borra una presentación capturada por error.
 *
 * Se vacía la fila en vez de quitarla: eliminar filas recorre todas las de
 * abajo y los índices que ya se leyeron dejan de servir. Solo debe usarse
 * cuando NO tiene compras — si las tiene, borrarla dejaría esas compras
 * apuntando a la nada y se perdería su historial de precios; para eso está
 * desactivarla.
 */
export async function borrarPresentacion(id: string): Promise<void> {
  await prepararPresentaciones();
  const filas = await getSheetData(HOJA_PRESENTACIONES, { crudo: true });
  const i = filas.findIndex((f) => f.ID_Presentacion === id);
  if (i === -1) return;
  const vacias: Record<number, string> = {};
  for (let c = 1; c <= COLS.length; c++) vacias[c] = '';
  await updateCells(HOJA_PRESENTACIONES, i + 2, vacias);
}

/** Las de un insumo, la más barata primero. */
export function deInsumo(todas: Presentacion[], idBiblioteca: string): Presentacion[] {
  return todas
    .filter((p) => p.idBiblioteca === idBiblioteca)
    .sort((a, b) => {
      // Las que no tienen precio van al final: no se pueden comparar
      if (a.porUnidad === 0) return 1;
      if (b.porUnidad === 0) return -1;
      return a.porUnidad - b.porUnidad;
    });
}
