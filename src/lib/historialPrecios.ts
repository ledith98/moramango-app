/**
 * historialPrecios.ts
 *
 * Cómo se ha movido el precio de algo, con el tiempo.
 *
 * Hasta ahora solo se guardaba el ÚLTIMO precio de cada presentación: al
 * anotar uno nuevo, el anterior desaparecía. Así no se puede contestar la
 * pregunta que importa —"¿esto subió o siempre costó así?"— ni deshacer un
 * precio capturado mal, porque el bueno ya se perdió al pisarlo.
 *
 * El historial se arma de DOS fuentes, y eso es a propósito:
 *
 *   COMPRAS      lo que de verdad pagaste. Ya viven en Compras_Insumos y
 *                no se copian aquí: duplicarlas es garantizar que un día
 *                digan cosas distintas. Se leen de allá.
 *   ANOTACIONES  precios que viste sin comprar —fuiste, preguntaste,
 *                apuntaste— y las confirmaciones de "sigue igual". Esos no
 *                tenían dónde vivir; esta hoja es su lugar.
 *
 * Borrar solo aplica a las anotaciones. Una compra mal capturada se
 * corrige donde se capturó, en Insumos → Lo que he comprado, porque
 * borrarla también mueve el stock y lo gastado.
 */

import { appendRow, ensureSheet, getSheetData, updateCells } from './googleSheets';
import { siguienteId } from './ids';
import { fechaDeCelda, fechaHoyMTY } from './pedidoFecha';
import { comoNumero, type OrigenPrecio, type RegistroPrecio } from './precios';

export const HOJA_HISTORIAL = 'Historial_Precios';
const COLS = [
  'ID_Registro',
  'ID_Presentacion',
  'ID_Biblioteca',
  'Fecha',
  'Precio',
  'Contenido',
  'Costo_Unidad',
  // 'anotado' = lo vio y lo apuntó · 'revisado' = confirmó que sigue igual
  'Origen',
  'Quien',
];

export async function prepararHistorial(): Promise<void> {
  await ensureSheet(HOJA_HISTORIAL, COLS);
}

/**
 * Deja constancia de un precio visto.
 *
 * Nunca lanza: que falle el historial no puede impedir que se guarde el
 * precio, que es lo que la persona vino a hacer.
 */
export async function anotarEnHistorial(datos: {
  idPresentacion: string;
  idBiblioteca: string;
  precio: number;
  contenido: number;
  origen: OrigenPrecio;
  quien: string;
  fecha?: string;
}): Promise<void> {
  if (!(datos.precio > 0) || !datos.idPresentacion) return;
  try {
    await prepararHistorial();
    const filas = await getSheetData(HOJA_HISTORIAL, { crudo: true });
    const id = siguienteId(filas, 'ID_Registro', 'HIS', 4);
    const contenido = comoNumero(datos.contenido);
    await appendRow(HOJA_HISTORIAL, [
      id,
      datos.idPresentacion,
      datos.idBiblioteca,
      datos.fecha || fechaHoyMTY(),
      comoNumero(datos.precio),
      contenido,
      contenido > 0 ? Math.round((datos.precio / contenido) * 10000) / 10000 : '',
      datos.origen,
      datos.quien || '',
    ]);
  } catch (error) {
    console.error('No se pudo anotar en el historial de precios:', error);
  }
}

/** Las anotaciones de una presentación, de la más nueva a la más vieja. */
export async function leerAnotaciones(idPresentacion: string): Promise<RegistroPrecio[]> {
  try {
    const filas = await getSheetData(HOJA_HISTORIAL, { crudo: true });
    return filas
      .filter((f) => f.ID_Registro && f.ID_Presentacion === idPresentacion)
      .map((f) => {
        const precio = comoNumero(f.Precio);
        const contenido = comoNumero(f.Contenido);
        return {
          id: f.ID_Registro,
          fecha: fechaDeCelda(f.Fecha),
          precio,
          contenido,
          porUnidad: contenido > 0 ? precio / contenido : 0,
          origen: (f.Origen || 'anotado') as OrigenPrecio,
          quien: (f.Quien || '').toString().trim(),
        };
      });
  } catch {
    // Todavía sin hoja: se crea sola con la primera anotación
    return [];
  }
}

/**
 * Borra una anotación capturada mal.
 *
 * Se vacía la fila en vez de quitarla: eliminar filas recorre todas las de
 * abajo y los índices ya leídos dejan de servir.
 *
 * Devuelve false si no existe. Quien llama debe recalcular después cuál es
 * el precio vigente: si se borró el más reciente, la presentación seguiría
 * mostrando justo el precio que se acaba de declarar equivocado.
 */
export async function borrarAnotacion(id: string): Promise<boolean> {
  await prepararHistorial();
  const filas = await getSheetData(HOJA_HISTORIAL, { crudo: true });
  const i = filas.findIndex((f) => f.ID_Registro === id);
  if (i === -1) return false;
  const vacias: Record<number, string> = {};
  for (let c = 1; c <= COLS.length; c++) vacias[c] = '';
  await updateCells(HOJA_HISTORIAL, i + 2, vacias);
  return true;
}
