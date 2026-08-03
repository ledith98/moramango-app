/**
 * ajustes.ts
 *
 * Ajustes del negocio que la dueña puede cambiar desde el panel, sin
 * tocar código. Viven en una hoja clave-valor (`Ajustes_Tienda`) para que
 * también se puedan revisar o corregir desde Google Sheets.
 *
 * Cada ajuste declara su valor por omisión, así que si la hoja está vacía
 * o alguien borra una fila, el negocio sigue funcionando igual que antes.
 */

import { appendRow, ensureSheet, getSheetData, updateCell } from './googleSheets';
import { HORARIO_DEFAULT, Horario, parsearHorario, serializarHorario } from './horario';

const HOJA = 'Ajustes_Tienda';
const COLS = ['Clave', 'Valor', 'Nota', 'Fecha'];

/** Tope de precio del artículo gratis de la décima compra. */
export const CLAVE_TOPE_ARTICULO = 'TopeArticuloGratis';
export const TOPE_ARTICULO_DEFAULT = 35;

/**
 * En qué orden se ven los grupos de alimentos en la tienda.
 *
 * Se guarda con "|" y no con coma porque una categoría podría llevar coma
 * en el nombre y partiría la lista en dos.
 */
export const CLAVE_ORDEN_CATEGORIAS = 'OrdenCategorias';
export const ORDEN_CATEGORIAS_DEFAULT = [
  'Combos',
  'Comida salada',
  'Jugos',
  'Licuados',
  'Comida dulce',
  'Bebidas',
];
const SEPARADOR = '|';

/** Horario de atención: a qué horas se pueden hacer pedidos. */
export const CLAVE_HORARIO = 'HorarioTienda';

/**
 * Dirección del local, para que el cliente sepa a dónde ir por su pedido.
 * Vacía = no se muestra nada, en vez de enseñar una dirección inventada.
 */
export const CLAVE_DIRECCION = 'DireccionLocal';
export const CLAVE_MAPA = 'MapaLocal';

export interface Ajustes {
  topeArticuloGratis: number;
  ordenCategorias: string[];
  horario: Horario;
  /** Dónde está el local y cómo llegar; ambos pueden ir vacíos */
  direccion: string;
  mapa: string;
}

// Viven en su propio archivo para que la tienda y el panel las puedan usar
// sin arrastrar Google Sheets al navegador.
export { claveCategoria, posicionCategoria } from './categorias';

async function preparar() {
  await ensureSheet(HOJA, COLS);
}

/**
 * Los ajustes se leen en cada pedido y en cada carga del menú, pero cambian
 * una vez cada varios meses. Sin esto, cada visita al menú gastaba dos
 * viajes a Google (uno para revisar que la hoja existiera y otro para
 * leerla) antes de siquiera empezar a leer los productos.
 *
 * Al guardar se limpia, así que un cambio desde el panel se ve al instante.
 */
const VIDA_CACHE_MS = 60 * 1000;
let cache: { valor: Ajustes; hasta: number } | null = null;

export function olvidarAjustes() {
  cache = null;
}

export async function leerAjustes(): Promise<Ajustes> {
  if (cache && Date.now() < cache.hasta) return cache.valor;
  try {
    // Sin ensureSheet: si la hoja todavía no existe, la lectura falla y se
    // devuelven los valores por omisión, que es justo lo que se quiere. La
    // hoja se crea sola la primera vez que se guarda algo.
    const filas = await getSheetData(HOJA, { crudo: true });
    const valor = filas.find((f) => f.Clave === CLAVE_TOPE_ARTICULO)?.Valor;
    const tope = parseFloat((valor ?? '').toString());

    const crudo = (filas.find((f) => f.Clave === CLAVE_ORDEN_CATEGORIAS)?.Valor ?? '').toString();
    const orden = crudo
      .split(SEPARADOR)
      .map((c) => c.trim())
      .filter(Boolean);

    const horarioCrudo = (filas.find((f) => f.Clave === CLAVE_HORARIO)?.Valor ?? '').toString();
    const texto = (clave: string) =>
      (filas.find((f) => f.Clave === clave)?.Valor ?? '').toString().trim();

    const ajustes: Ajustes = {
      topeArticuloGratis: !isNaN(tope) && tope > 0 ? tope : TOPE_ARTICULO_DEFAULT,
      ordenCategorias: orden.length > 0 ? orden : ORDEN_CATEGORIAS_DEFAULT,
      horario: parsearHorario(horarioCrudo),
      direccion: texto(CLAVE_DIRECCION),
      mapa: texto(CLAVE_MAPA),
    };
    cache = { valor: ajustes, hasta: Date.now() + VIDA_CACHE_MS };
    return ajustes;
  } catch {
    // Un error no se guarda en caché: la próxima visita vuelve a intentar
    // Si la hoja falla, el negocio sigue con los valores de siempre. Ojo
    // con el horario: se cae del lado de dejar pedir, porque rechazar
    // pedidos buenos por un error de lectura sale más caro.
    return {
      topeArticuloGratis: TOPE_ARTICULO_DEFAULT,
      ordenCategorias: ORDEN_CATEGORIAS_DEFAULT,
      horario: HORARIO_DEFAULT,
      direccion: '',
      mapa: '',
    };
  }
}

/** Guarda el horario de atención. */
export async function guardarHorario(horario: Horario): Promise<void> {
  await guardarAjuste(
    CLAVE_HORARIO,
    serializarHorario(horario),
    'Horario en que se pueden hacer pedidos desde la tienda'
  );
}

/** Guarda el orden en que se ven los grupos en la tienda. */
export async function guardarOrdenCategorias(orden: string[]): Promise<void> {
  const limpio = orden.map((c) => c.trim()).filter(Boolean);
  await guardarAjuste(
    CLAVE_ORDEN_CATEGORIAS,
    limpio.join(SEPARADOR),
    'Orden de los grupos de alimentos en la tienda'
  );
}

/** Guarda (o crea) un ajuste por su clave. */
export async function guardarAjuste(clave: string, valor: string | number, nota = ''): Promise<void> {
  olvidarAjustes();
  await preparar();
  const filas = await getSheetData(HOJA);
  const idx = filas.findIndex((f) => f.Clave === clave);
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' });

  if (idx === -1) {
    await appendRow(HOJA, [clave, valor, nota, fecha]);
    return;
  }
  const fila = idx + 2; // +1 encabezado, +1 base 1
  await updateCell(HOJA, fila, 2, valor);
  if (nota) await updateCell(HOJA, fila, 3, nota);
  await updateCell(HOJA, fila, 4, fecha);
}
