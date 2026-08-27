/**
 * respaldo.ts
 *
 * Una copia diaria de toda la hoja de cálculo.
 *
 * El negocio entero vive en un solo archivo de Google Sheets: los pedidos,
 * los clientes, el inventario, las recetas, el dinero. Un borrado por
 * error, una fórmula mal pegada o perder acceso a la cuenta y no hay de
 * dónde recuperarlo. Google guarda 30 días de historial de versiones, pero
 * eso no sirve si se pierde la cuenta, ni si el daño se descubre dos meses
 * después.
 *
 * La copia se guarda en el almacén de la app —el mismo de las fotos— y no
 * en otro Google Drive: si el problema es Google, un respaldo dentro de
 * Google no es respaldo.
 *
 * Se guarda TODO en crudo, tal como está en las celdas, sin interpretar
 * nada. Un respaldo que ya viene procesado es un respaldo que arrastra los
 * errores del programa que lo procesó.
 */

import { del, list, put } from '@vercel/blob';
import { google } from 'googleapis';
import { fechaHoyMTY } from './pedidoFecha';

/** Cuántos días de respaldos se conservan. */
export const DIAS_QUE_SE_GUARDAN = 30;

const CARPETA = 'respaldos/';

export const respaldoListo = (): boolean =>
  !!process.env.BLOB_READ_WRITE_TOKEN && !!process.env.GOOGLE_SHEETS_ID;

export interface Respaldo {
  /** Nombre del archivo, con la fecha adentro */
  nombre: string;
  fecha: string;
  url: string;
  bytes: number;
  subido: string;
}

/**
 * Lee las pestañas de una en una y no con `batchGet`.
 *
 * batchGet traería todo en una llamada, pero una hoja con 46 columnas y
 * mil filas por 19 pestañas revienta el tamaño de respuesta y falla
 * entera. De una en una tarda unos segundos más y nunca se cae; si una
 * pestaña falla, se anota el error y las demás sí se respaldan.
 */
async function leerTodo(): Promise<{
  hojas: Record<string, string[][]>;
  fallaron: string[];
  titulo: string;
}> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

  const info = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title',
  });
  const titulo = info.data.properties?.title ?? 'Moramango';
  const nombres = (info.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => !!t);

  const hojas: Record<string, string[][]> = {};
  const fallaron: string[] = [];
  for (const nombre of nombres) {
    try {
      const r = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: nombre,
        // Sin formatear: el valor real, no lo que Google decide mostrar.
        // Con el idioma de este archivo, "22.33" se ve como "22,33" y un
        // respaldo con comas en vez de puntos no se puede restaurar.
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      });
      hojas[nombre] = (r.data.values ?? []).map((f) =>
        f.map((c) => (c === null || c === undefined ? '' : String(c)))
      );
    } catch (error) {
      console.error(`No se pudo respaldar la pestaña ${nombre}:`, error);
      fallaron.push(nombre);
    }
  }
  return { hojas, fallaron, titulo };
}

/** Guarda la copia de hoy y borra las que ya pasaron de tiempo. */
export async function hacerRespaldo(): Promise<{
  nombre: string;
  url: string;
  bytes: number;
  pestanas: number;
  filas: number;
  fallaron: string[];
  borrados: number;
}> {
  const fecha = fechaHoyMTY();
  const { hojas, fallaron, titulo } = await leerTodo();

  const filas = Object.values(hojas).reduce((s, f) => s + f.length, 0);
  const contenido = JSON.stringify({
    archivo: titulo,
    fecha,
    generado: new Date().toISOString(),
    pestanas: Object.keys(hojas).length,
    filas,
    fallaron,
    hojas,
  });

  /**
   * El nombre lleva la fecha y nada más, sin sufijo al azar: así el
   * respaldo del día se pisa a sí mismo si se corre dos veces, en vez de
   * dejar copias duplicadas del mismo día ocupando espacio.
   */
  const nombre = `${CARPETA}${fecha}.json`;
  const { url } = await put(nombre, contenido, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });

  return {
    nombre,
    url,
    bytes: contenido.length,
    pestanas: Object.keys(hojas).length,
    filas,
    fallaron,
    borrados: await limpiarViejos(),
  };
}

/**
 * Borra los respaldos que pasaron de DIAS_QUE_SE_GUARDAN.
 *
 * Se conserva SIEMPRE el más reciente pase lo que pase: si algún día la
 * hoja quedara vacía y el respaldo también, borrar el último por viejo
 * dejaría a nadie con nada.
 */
async function limpiarViejos(): Promise<number> {
  try {
    const { blobs } = await list({ prefix: CARPETA });
    if (blobs.length <= 1) return 0;

    const limite = new Date(Date.now() - DIAS_QUE_SE_GUARDAN * 86400000)
      .toISOString()
      .slice(0, 10);
    const fechaDe = (n: string) => n.replace(CARPETA, '').replace('.json', '');

    const ordenados = [...blobs].sort((a, b) => (fechaDe(a.pathname) < fechaDe(b.pathname) ? 1 : -1));
    const viejos = ordenados.slice(1).filter((b) => fechaDe(b.pathname) < limite);
    if (viejos.length === 0) return 0;

    await del(viejos.map((b) => b.url));
    return viejos.length;
  } catch (error) {
    // Que falle la limpieza no invalida el respaldo, que es lo que importa
    console.error('No se pudieron borrar los respaldos viejos:', error);
    return 0;
  }
}

/** Los respaldos que hay guardados, del más nuevo al más viejo. */
export async function listarRespaldos(): Promise<Respaldo[]> {
  if (!respaldoListo()) return [];
  try {
    const { blobs } = await list({ prefix: CARPETA });
    return blobs
      .map((b) => ({
        nombre: b.pathname.replace(CARPETA, ''),
        fecha: b.pathname.replace(CARPETA, '').replace('.json', ''),
        url: b.url,
        bytes: b.size,
        subido: b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt),
      }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  } catch (error) {
    console.error('No se pudieron listar los respaldos:', error);
    return [];
  }
}
