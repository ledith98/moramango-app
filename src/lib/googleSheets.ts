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

export async function appendRow(tabName: string, values: (string | number | boolean)[]) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: tabName,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
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