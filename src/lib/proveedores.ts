/**
 * proveedores.ts
 *
 * Directorio de a quién le compras, y a cómo.
 *
 * El nombre del proveedor vivía como texto libre en dos lugares: el insumo
 * y cada compra. Escrito a mano se desvía —"CAG", "Gac", "CAG Bodega
 * 200"— y en cuanto se desvía deja de poder compararse: la misma bodega
 * aparece como tres, cada una con su historia de precios partida.
 *
 * Con el directorio, el nombre se elige de una lista y el precio de cada
 * insumo se puede poner uno junto a otro. Esa comparación es el punto:
 * saber si la fruta sale más barata en la Central o en la frutería no se
 * puede responder si cada compra dice el nombre de un modo distinto.
 *
 * Lo que un proveedor vende NO se declara a mano: sale de lo que se le ha
 * comprado. Una lista declarada se desactualiza; el historial no miente.
 */

import { anotar } from './bitacora';
import { appendRow, ensureColumn, ensureSheet, getSheetData, updateCells } from './googleSheets';
import { siguienteId } from './ids';

export const HOJA_PROVEEDORES = 'Proveedores';
const COLS = ['ID_Proveedor', 'Nombre', 'Contacto', 'Telefono', 'Notas', 'Activo'];

/** Columnas 1-based, para updateCells */
export const COL_PROV = {
  nombre: 2,
  contacto: 3,
  telefono: 4,
  notas: 5,
  activo: 6,
} as const;

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  notas: string;
  activo: boolean;
}

/** Cómo se le compra a un proveedor un insumo concreto. */
export interface PrecioProveedor {
  idProveedor: string;
  proveedor: string;
  /** Precio por unidad de compra de la última vez */
  ultimoPrecio: number;
  /** Promedio de todo lo que se le ha comprado de ese insumo */
  promedio: number;
  compras: number;
  ultimaFecha: string;
  /** Lo más barato encontrado para ese insumo lleva esta marca */
  esElMasBarato: boolean;
}

export const normalizar = (t: string | undefined) =>
  (t ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export async function prepararProveedores(): Promise<void> {
  await ensureSheet(HOJA_PROVEEDORES, COLS);
  // ensureSheet solo escribe encabezados al CREAR la hoja; para una que ya
  // existía, esto agrega la columna que falte.
  await ensureColumn(HOJA_PROVEEDORES, 'Activo');
}

export async function leerProveedores(): Promise<Proveedor[]> {
  try {
    const filas = await getSheetData(HOJA_PROVEEDORES, { crudo: true });
    return filas
      .filter((f) => f.ID_Proveedor && (f.Nombre || '').toString().trim())
      .map((f) => ({
        id: f.ID_Proveedor,
        nombre: (f.Nombre || '').toString().trim(),
        contacto: (f.Contacto || '').toString().trim(),
        telefono: (f.Telefono || '').toString().trim(),
        notas: (f.Notas || '').toString().trim(),
        // Vacío se lee como activo, para los que se creen sin la columna
        activo: (f.Activo || '').toString().trim().toLowerCase() !== 'no',
      }));
  } catch {
    // Todavía sin hoja: se crea sola al dar de alta el primero
    return [];
  }
}

/**
 * Da de alta un proveedor si no existe ya con ese nombre.
 *
 * Devuelve su ID en los dos casos: quien llama solo quiere el ID, no le
 * importa si hubo que crearlo. Sin este "si no existe", cada compra
 * escrita a mano crearía un proveedor nuevo y volveríamos al desorden que
 * el directorio viene a resolver.
 */
export async function idDeProveedor(nombre: string, quien = ''): Promise<string> {
  const limpio = (nombre ?? '').toString().trim();
  if (!limpio) return '';
  await prepararProveedores();
  const filas = await getSheetData(HOJA_PROVEEDORES, { crudo: true });
  const ya = filas.find((f) => normalizar(f.Nombre) === normalizar(limpio));
  if (ya) return ya.ID_Proveedor;

  const id = siguienteId(filas, 'ID_Proveedor', 'PRV');
  await appendRow(HOJA_PROVEEDORES, [id, limpio, '', '', '', 'si']);
  if (quien) await anotar(quien, 'Insumos', `Dio de alta al proveedor "${limpio}"`);
  return id;
}

export async function guardarProveedor(
  id: string,
  datos: Partial<Omit<Proveedor, 'id'>>
): Promise<void> {
  await prepararProveedores();
  const filas = await getSheetData(HOJA_PROVEEDORES, { crudo: true });
  const i = filas.findIndex((f) => f.ID_Proveedor === id);
  if (i === -1) throw new Error('Proveedor no encontrado');

  const cambios: Record<number, string> = {};
  if (datos.nombre !== undefined) cambios[COL_PROV.nombre] = datos.nombre.trim();
  if (datos.contacto !== undefined) cambios[COL_PROV.contacto] = datos.contacto.trim();
  if (datos.telefono !== undefined) cambios[COL_PROV.telefono] = datos.telefono.trim();
  if (datos.notas !== undefined) cambios[COL_PROV.notas] = datos.notas.trim();
  if (datos.activo !== undefined) cambios[COL_PROV.activo] = datos.activo ? 'si' : 'no';
  if (Object.keys(cambios).length > 0) {
    await updateCells(HOJA_PROVEEDORES, i + 2, cambios);
  }
}

/**
 * A cómo sale cada insumo con cada proveedor, sacado del historial.
 *
 * Se compara el precio por UNIDAD DE COMPRA, que es lo único comparable:
 * tres kilos a $150 y un kilo a $55 solo se pueden enfrentar como $50 y
 * $55 el kilo.
 *
 * @param compras filas de Compras_Insumos
 * @param nombreProveedor  id → nombre, para las compras que ya traen ID
 */
export function preciosPorInsumo(
  compras: Record<string, string>[],
  nombreProveedor: Map<string, string>
): Map<string, PrecioProveedor[]> {
  const porInsumo = new Map<string, Map<string, PrecioProveedor & { suma: number }>>();

  for (const c of compras) {
    const idBib = (c.ID_Biblioteca || '').toString().trim();
    const precio = parseFloat(c.Precio_Unidad_Compra) || 0;
    if (!idBib || precio <= 0) continue;

    // La compra puede traer el ID (nuevas) o solo el texto (viejas)
    const idProv = (c.ID_Proveedor || '').toString().trim();
    const texto = (c.Donde || '').toString().trim();
    const nombre = idProv ? (nombreProveedor.get(idProv) ?? texto) : texto;
    if (!nombre) continue;
    const clave = idProv || normalizar(nombre);

    if (!porInsumo.has(idBib)) porInsumo.set(idBib, new Map());
    const grupo = porInsumo.get(idBib)!;
    const actual = grupo.get(clave) ?? {
      idProveedor: idProv,
      proveedor: nombre,
      ultimoPrecio: 0,
      promedio: 0,
      compras: 0,
      ultimaFecha: '',
      esElMasBarato: false,
      suma: 0,
    };
    actual.compras += 1;
    actual.suma += precio;
    // El historial viene en orden de captura; la última gana
    actual.ultimoPrecio = precio;
    actual.ultimaFecha = (c.Fecha || '').toString();
    grupo.set(clave, actual);
  }

  const salida = new Map<string, PrecioProveedor[]>();
  for (const [idBib, grupo] of porInsumo) {
    const lista = [...grupo.values()].map((v) => ({
      idProveedor: v.idProveedor,
      proveedor: v.proveedor,
      ultimoPrecio: Math.round(v.ultimoPrecio * 100) / 100,
      promedio: Math.round((v.suma / v.compras) * 100) / 100,
      compras: v.compras,
      ultimaFecha: v.ultimaFecha,
      esElMasBarato: false,
    }));
    // Marcar el más barato solo tiene sentido si hay con quién comparar
    if (lista.length > 1) {
      const min = Math.min(...lista.map((x) => x.ultimoPrecio));
      for (const x of lista) x.esElMasBarato = x.ultimoPrecio === min;
    }
    lista.sort((a, b) => a.ultimoPrecio - b.ultimoPrecio);
    salida.set(idBib, lista);
  }
  return salida;
}
