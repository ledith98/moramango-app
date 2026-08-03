import { google } from 'googleapis';

/**
 * Google limita las peticiones a ~60 lecturas/minuto por cuenta de
 * servicio. Bajo uso intenso (guardar insumos seguido, que recarga varias
 * hojas) se topa el límite y Google responde 429; sin manejo, la lectura
 * falla y el panel se vacía o expulsa al usuario.
 *
 * Este envoltorio reintenta con espera creciente (300ms, 900ms, 2.7s)
 * cuando el error es de cuota o temporal (429/503). Otros errores se
 * propagan de inmediato.
 */
async function conReintento<T>(fn: () => Promise<T>, intentos = 4): Promise<T> {
  let espera = 300;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: number; status?: number })?.code
        ?? (error as { response?: { status?: number } })?.response?.status;
      const temporal = code === 429 || code === 503 || code === 500;
      if (!temporal || i >= intentos - 1) throw error;
      await new Promise((r) => setTimeout(r, espera));
      espera *= 3;
    }
  }
}

function getAuthClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!privateKey) throw new Error('Falta GOOGLE_PRIVATE_KEY');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

/**
 * Lee una pestaña como lista de objetos {encabezado: valor}.
 *
 * Por defecto devuelve los valores YA FORMATEADOS por Google. Ojo: este
 * Sheet tiene locale es_ES, donde el separador decimal es la coma, así que
 * 22.33 se lee como "22,33" y `parseFloat` lo trunca a 22. Para cualquier
 * hoja con números decimales usa `{ crudo: true }`: devuelve el valor real
 * (number) sin pasar por el formato regional.
 */
export async function getSheetData(tabName: string, opciones?: { crudo?: boolean }) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await conReintento(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: tabName,
      valueRenderOption: opciones?.crudo ? 'UNFORMATTED_VALUE' : 'FORMATTED_VALUE',
    })
  );

  const rows = response.data.values;
  if (!rows || rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows.slice(1).map((row) =>
    headers.reduce((obj, header, index) => {
      // En modo crudo llegan numbers y booleans en vez de texto. String()
      // normaliza los números con punto decimal (independiente del locale),
      // y los booleanos se devuelven como 'TRUE'/'FALSE' — igual que los
      // escribe la app y que los muestra el modo formateado.
      const celda = row[index];
      if (celda === undefined || celda === null) obj[header] = '';
      else if (typeof celda === 'boolean') obj[header] = celda ? 'TRUE' : 'FALSE';
      else obj[header] = String(celda);
      return obj;
    }, {} as Record<string, string>)
  );
}

/**
 * Agrega una fila al final de una hoja usando rango explícito.
 * Evita que la detección automática de "append" se confunda con tablas estructuradas.
 * Devuelve el número de fila (1-based) donde se escribió, para poder
 * actualizar columnas extra con updateCell sin re-leer la hoja.
 */
export async function appendRow(tabName: string, values: (string | number | boolean)[]): Promise<number> {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Leer datos actuales para saber en qué fila escribir
  const currentData = await conReintento(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: tabName,
    })
  );

  const currentRows = currentData.data.values || [];
  const nextRow = currentRows.length + 1; // primera fila vacía después del último dato

  // 2. Calcular columna final según cantidad de valores (A-Z, hasta 26 columnas)
  const numCols = values.length;
  if (numCols > 26) {
    throw new Error(`appendRow solo soporta hasta 26 columnas, recibió ${numCols}`);
  }
  const endCol = String.fromCharCode(64 + numCols);

  // 3. Escribir con rango explícito — sin depender de detección automática
  await conReintento(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!A${nextRow}:${endCol}${nextRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    })
  );

  return nextRow;
}

export async function updateCell(
  tabName: string,
  rowIndex: number,
  colIndex: number,
  value: string | number | boolean
) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const colLetter = String.fromCharCode(64 + colIndex);
  await conReintento(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!${colLetter}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[value]] },
    })
  );
}

/**
 * Escribe varias celdas de la MISMA fila (misma pestaña) en una sola
 * petición. Cada updateCell suelto es un viaje a Google (~150 ms); al
 * editar un insumo eran ~10 viajes en fila = >1.5 s y a veces se atoraba.
 * Con esto es UN viaje.
 *
 * @param celdas  { colIndex (1-based) → valor }
 */
export async function updateCells(
  tabName: string,
  rowIndex: number,
  celdas: Record<number, string | number | boolean>
) {
  const entradas = Object.entries(celdas);
  if (entradas.length === 0) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const data = entradas.map(([col, value]) => {
    const colLetter = String.fromCharCode(64 + Number(col));
    return {
      range: `${tabName}!${colLetter}${rowIndex}`,
      values: [[value]],
    };
  });

  await conReintento(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    })
  );
}

export async function findRow(tabName: string, columnName: string, value: string) {
  const rows = await getSheetData(tabName);
  const index = rows.findIndex((row) => row[columnName] === value);
  if (index === -1) return null;
  return { data: rows[index], rowIndex: index + 2 };
}

/**
 * Memoria de lo que ya se revisó de la estructura del Sheet.
 *
 * ensureSheet y ensureColumn gastan un viaje a Google cada vez, aunque la
 * hoja y la columna lleven meses ahí. Insumos llamaba a cinco de estas
 * antes de leer un solo dato: 1.2 s de espera en cada carga y en cada
 * guardado.
 *
 * Se recuerda por un rato y no para siempre, porque la hoja se puede
 * editar a mano desde Google Sheets: si alguien borra una columna, a los
 * diez minutos se vuelve a revisar y se repone sola.
 */
const VIDA_ESTRUCTURA_MS = 10 * 60 * 1000;
const hojasVistas = new Map<string, number>();
const columnasVistas = new Map<string, { indice: number; hasta: number }>();

/** Para las pruebas y para después de tocar la estructura a propósito. */
export function olvidarEstructura() {
  hojasVistas.clear();
  columnasVistas.clear();
  listaEnVuelo = null;
}

/**
 * Pide la lista de pestañas, pero si ya hay una petición en camino se
 * cuelga de esa. Preparar el inventario revisa tres hojas a la vez y las
 * tres preguntaban lo mismo: eran tres consultas contra el límite de
 * Google (60 por minuto) para enterarse del mismo dato. Pasarse de ese
 * límite es lo que dispara las esperas largas.
 */
let listaEnVuelo: Promise<string[]> | null = null;

function listarHojas(): Promise<string[]> {
  if (listaEnVuelo) return listaEnVuelo;
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  listaEnVuelo = conReintento(() =>
    sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      fields: 'sheets.properties.title',
    })
  )
    .then((meta) =>
      (meta.data.sheets || [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => !!t)
    )
    .finally(() => {
      listaEnVuelo = null;
    });
  return listaEnVuelo;
}

/**
 * Garantiza que una pestaña exista, creándola con sus encabezados si no
 * está. Permite estrenar funciones nuevas sin que nadie tenga que
 * preparar el Sheet a mano.
 */
export async function ensureSheet(tabName: string, headers: string[]): Promise<void> {
  const vista = hojasVistas.get(tabName);
  if (vista !== undefined && Date.now() < vista) return;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // La respuesta trae los nombres de TODAS las pestañas, así que se
  // apuntan todas de una vez y no solo la que se preguntó.
  const titulos = await listarHojas();
  const caduca = Date.now() + VIDA_ESTRUCTURA_MS;
  for (const t of titulos) hojasVistas.set(t, caduca);

  if (titulos.includes(tabName)) return;

  await conReintento(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
  );

  const endCol = String.fromCharCode(64 + headers.length);
  await conReintento(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!A1:${endCol}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    })
  );

  hojasVistas.set(tabName, Date.now() + VIDA_ESTRUCTURA_MS);
}

/**
 * Garantiza que una columna exista en la hoja (por nombre de encabezado).
 * Si ya existe, devuelve su índice (1-based). Si no, la agrega al final
 * de los encabezados y devuelve el nuevo índice.
 *
 * Útil para agregar campos nuevos (ej. "Eliminado") sin tener que editar
 * el Sheet a mano ni migrar filas existentes.
 */
export async function ensureColumn(tabName: string, columnName: string): Promise<number> {
  const llave = `${tabName}!${columnName}`;
  const vista = columnasVistas.get(llave);
  if (vista && Date.now() < vista.hasta) return vista.indice;

  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const headerRes = await conReintento(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!1:1`,
    })
  );

  // Igual que con las hojas: la fila de encabezados viene completa, así que
  // se apuntan todas las columnas de esa pestaña, no solo la que se pidió.
  const headers = (headerRes.data.values?.[0] as string[]) ?? [];
  const caduca = Date.now() + VIDA_ESTRUCTURA_MS;
  headers.forEach((h, i) => {
    if (h) columnasVistas.set(`${tabName}!${h}`, { indice: i + 1, hasta: caduca });
  });

  const existente = headers.indexOf(columnName);
  if (existente !== -1) return existente + 1;

  const nuevoIndice = headers.length + 1;
  const colLetter = String.fromCharCode(64 + nuevoIndice);
  await conReintento(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `${tabName}!${colLetter}1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[columnName]] },
    })
  );

  columnasVistas.set(llave, { indice: nuevoIndice, hasta: Date.now() + VIDA_ESTRUCTURA_MS });
  return nuevoIndice;
}
