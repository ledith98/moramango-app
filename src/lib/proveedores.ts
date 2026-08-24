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
import { fechaDeCelda } from './pedidoFecha';

export const HOJA_PROVEEDORES = 'Proveedores';
const COLS = [
  'ID_Proveedor',
  'Nombre',
  'Contacto',
  'Telefono',
  'Notas',
  'Activo',
  // Dirección escrita o enlace de Google Maps: se acepta lo que tenga a
  // la mano, y `enlaceMapa` decide qué hacer con cada forma.
  'Direccion',
];

/** Columnas 1-based, para updateCells */
export const COL_PROV = {
  nombre: 2,
  contacto: 3,
  telefono: 4,
  notas: 5,
  activo: 6,
  direccion: 7,
} as const;

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  notas: string;
  activo: boolean;
  /** Dirección escrita o enlace de Google Maps */
  direccion: string;
}

/** Cómo se le compra a un proveedor un insumo concreto. */
export interface PrecioProveedor {
  idProveedor: string;
  proveedor: string;
  /**
   * Lo que cuesta la UNIDAD DE RECETA (la pieza, el gramo, el ml).
   *
   * Es lo único comparable entre lugares: un paquete de 40 tenedores a $12
   * y uno de 25 a $8 no se pueden enfrentar como $12 contra $8 — el
   * segundo se ve más barato y es más caro ($0.30 contra $0.32 la pieza).
   */
  porUnidad: number;
  /** Lo que costó el paquete completo, para reconocer la compra */
  precioPaquete: number;
  /** Cuántas unidades de receta traía ese paquete */
  contenido: number;
  /** Promedio por unidad de receta de todo lo que se le ha comprado */
  promedio: number;
  compras: number;
  /** Cuándo es ese precio (YYYY-MM-DD) */
  ultimaFecha: string;
  /**
   * true = precio que anotaste sin haberle comprado todavía.
   *
   * Se distingue porque no valen lo mismo: uno salió de un ticket y el
   * otro de preguntar en el mostrador. Los dos sirven para decidir a
   * dónde ir, pero conviene saber cuál es cuál.
   */
  soloAnotado: boolean;
  /** Lo más barato encontrado para ese insumo lleva esta marca */
  esElMasBarato: boolean;
}

/** Un precio anotado a un proveedor, sin compra de por medio. */
export interface PrecioAnotado {
  idBiblioteca: string;
  idProveedor: string;
  porUnidad: number;
  precioPaquete: number;
  contenido: number;
  fecha: string;
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
  await ensureColumn(HOJA_PROVEEDORES, 'Direccion');
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
        direccion: (f.Direccion || '').toString().trim(),
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
  await appendRow(HOJA_PROVEEDORES, [id, limpio, '', '', '', 'si', '']);
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
  if (datos.direccion !== undefined) cambios[COL_PROV.direccion] = datos.direccion.trim();
  if (Object.keys(cambios).length > 0) {
    await updateCells(HOJA_PROVEEDORES, i + 2, cambios);
  }
}

/**
 * A cómo sale cada insumo con cada proveedor, sacado del historial.
 *
 * Se compara el precio por UNIDAD DE RECETA —la pieza, el gramo, el ml—
 * y no el del paquete. Un paquete de 40 tenedores a $12 y uno de 25 a $8
 * no se pueden enfrentar como $12 contra $8: el de $8 parece más barato y
 * sale más caro ($0.32 la pieza contra $0.30). Cada compra guarda cuánto
 * traía SU paquete, así que la cuenta sale aunque las presentaciones
 * cambien entre lugares.
 *
 * Cuenta dos cosas, y las dos hacen falta: lo que YA COMPRASTE (sale de
 * Compras_Insumos) y lo que solo ANOTASTE (el precio que le pusiste a una
 * presentación de ese proveedor, sin comprarle todavía). Con solo las
 * compras, un precio que fuiste a preguntar expresamente para comparar no
 * aparecía en la comparación — que es exactamente para lo que se anotó.
 *
 * Cuando hay de las dos para el mismo proveedor, gana la más reciente: si
 * la última vez que preguntaste fue después de la última vez que
 * compraste, ese es el precio que vale hoy.
 *
 * @param compras filas de Compras_Insumos
 * @param nombreProveedor  id → nombre, para las compras que ya traen ID
 * @param anotados precios declarados en las presentaciones
 */
export function preciosPorInsumo(
  compras: Record<string, string>[],
  nombreProveedor: Map<string, string>,
  anotados: PrecioAnotado[] = []
): Map<string, PrecioProveedor[]> {
  const porInsumo = new Map<string, Map<string, PrecioProveedor & { suma: number }>>();

  for (const c of compras) {
    const idBib = (c.ID_Biblioteca || '').toString().trim();
    if (!idBib) continue;

    // Costo_Unidad_Receta ya viene calculado con la equivalencia de ESA
    // compra. Si falta (compras viejas), se reconstruye.
    const cantidad = parseFloat(c.Cantidad_Compra) || 0;
    const equivalencia = parseFloat(c.Equivalencia) || 0;
    const precioPaquete = parseFloat(c.Precio_Unidad_Compra) || 0;
    let porUnidad = parseFloat(c.Costo_Unidad_Receta) || 0;
    if (porUnidad <= 0 && precioPaquete > 0 && equivalencia > 0) {
      porUnidad = precioPaquete / equivalencia;
    }
    if (porUnidad <= 0) continue;

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
      porUnidad: 0,
      precioPaquete: 0,
      contenido: 0,
      promedio: 0,
      compras: 0,
      ultimaFecha: '',
      soloAnotado: false,
      esElMasBarato: false,
      suma: 0,
    };
    actual.compras += 1;
    actual.suma += porUnidad;
    // El historial viene en orden de captura; la última gana
    actual.porUnidad = porUnidad;
    actual.precioPaquete = precioPaquete;
    actual.contenido = equivalencia;
    actual.ultimaFecha = fechaDeCelda(c.Fecha);
    void cantidad;
    grupo.set(clave, actual);
  }

  /**
   * Los precios anotados, encima de las compras.
   *
   * Si de ese proveedor no había nada, entra como opción nueva. Si ya
   * había una compra, solo pisa el precio cuando la anotación es más
   * reciente — una compra de la semana pasada vale más que un precio que
   * apuntaste hace tres meses.
   */
  for (const a of anotados) {
    if (!a.idBiblioteca || !a.idProveedor || !(a.porUnidad > 0)) continue;
    const nombre = nombreProveedor.get(a.idProveedor);
    if (!nombre) continue;

    if (!porInsumo.has(a.idBiblioteca)) porInsumo.set(a.idBiblioteca, new Map());
    const grupo = porInsumo.get(a.idBiblioteca)!;
    const previo = grupo.get(a.idProveedor);

    if (!previo) {
      grupo.set(a.idProveedor, {
        idProveedor: a.idProveedor,
        proveedor: nombre,
        porUnidad: a.porUnidad,
        precioPaquete: a.precioPaquete,
        contenido: a.contenido,
        promedio: a.porUnidad,
        compras: 0,
        ultimaFecha: a.fecha,
        soloAnotado: true,
        esElMasBarato: false,
        suma: a.porUnidad,
      });
      continue;
    }
    if (a.fecha && a.fecha > previo.ultimaFecha) {
      previo.porUnidad = a.porUnidad;
      previo.precioPaquete = a.precioPaquete;
      previo.contenido = a.contenido;
      previo.ultimaFecha = a.fecha;
    }
  }

  const salida = new Map<string, PrecioProveedor[]>();
  for (const [idBib, grupo] of porInsumo) {
    const lista = [...grupo.values()].map((v) => ({
      idProveedor: v.idProveedor,
      proveedor: v.proveedor,
      porUnidad: Math.round(v.porUnidad * 10000) / 10000,
      precioPaquete: Math.round(v.precioPaquete * 100) / 100,
      contenido: v.contenido,
      promedio: Math.round((v.suma / v.compras) * 10000) / 10000,
      compras: v.compras,
      ultimaFecha: v.ultimaFecha,
      soloAnotado: v.soloAnotado,
      esElMasBarato: false,
    }));
    // Marcar el más barato solo tiene sentido si hay con quién comparar
    if (lista.length > 1) {
      const min = Math.min(...lista.map((x) => x.porUnidad));
      for (const x of lista) x.esElMasBarato = x.porUnidad === min;
    }
    lista.sort((a, b) => a.porUnidad - b.porUnidad);
    salida.set(idBib, lista);
  }
  return salida;
}
