import { google } from 'googleapis';

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

export async function getSheetData(tabName: string) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: tabName,
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) return [];

  const headers = rows[0] as string[];
  return rows.slice(1).map((row) =>
    headers.reduce((obj, header, index) => {
      obj[header] = row[index] ?? '';
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
  const currentData = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: tabName,
  });

  const currentRows = currentData.data.values || [];
  const nextRow = currentRows.length + 1; // primera fila vacía después del último dato

  // 2. Calcular columna final según cantidad de valores (A-Z, hasta 26 columnas)
  const numCols = values.length;
  if (numCols > 26) {
    throw new Error(`appendRow solo soporta hasta 26 columnas, recibió ${numCols}`);
  }
  const endCol = String.fromCharCode(64 + numCols);

  // 3. Escribir con rango explícito — sin depender de detección automática
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!A${nextRow}:${endCol}${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });

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
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!${colLetter}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

export async function findRow(tabName: string, columnName: string, value: string) {
  const rows = await getSheetData(tabName);
  const index = rows.findIndex((row) => row[columnName] === value);
  if (index === -1) return null;
  return { data: rows[index], rowIndex: index + 2 };
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
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!1:1`,
  });

  const headers = (headerRes.data.values?.[0] as string[]) ?? [];
  const existente = headers.indexOf(columnName);
  if (existente !== -1) return existente + 1;

  const nuevoIndice = headers.length + 1;
  const colLetter = String.fromCharCode(64 + nuevoIndice);
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: `${tabName}!${colLetter}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[columnName]] },
  });

  return nuevoIndice;
}
