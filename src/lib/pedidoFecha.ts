/**
 * pedidoFecha.ts
 *
 * Fecha_Hora en PEDIDOS se guarda con
 * `new Date().toLocaleString('es-MX', { timeZone: 'America/Monterrey' })`,
 * que produce un formato NO zero-padded y en 12h, ej: "9/7/2026, 9:05:03 a.m."
 * `new Date(string)` no puede parsear eso de forma confiable (Node lo
 * interpretaría con reglas ambiguas de M/D vs D/M).
 *
 * NOTA: el formato de ID_Pedido cambió con el tiempo — versiones viejas
 * incluían la hora (PED-YYMMDD-HHMMSS-NNN), la versión actual no
 * (PED-YYMMDD-NNN). Por eso NO se debe depender del ID para obtener la
 * hora — solo Fecha_Hora es la fuente confiable de fecha/hora real.
 * Este módulo parsea Fecha_Hora directamente con una regex fija en vez
 * de usar `new Date(string)`.
 */

export function fechaHoyMTY(): string {
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD
}

export interface FechaHoraPedido {
  fechaISO: string; // YYYY-MM-DD
  horaLegible: string; // HH:MM (24h, zero-padded)
  timestamp: number; // clave numérica solo para ordenar, no es epoch real
}

const REGEX_FECHA_HORA = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(a\.\s*m\.|p\.\s*m\.)$/i;

export function parsearFechaHora(fechaHoraStr: string | undefined | null): FechaHoraPedido | null {
  const match = REGEX_FECHA_HORA.exec((fechaHoraStr ?? '').trim());
  if (!match) return null;

  const [, ddStr, mmStr, yyyyStr, hhStr, miStr, ssStr, ampm] = match;
  const dd = parseInt(ddStr, 10);
  const mm = parseInt(mmStr, 10);
  const yyyy = parseInt(yyyyStr, 10);
  let hh = parseInt(hhStr, 10);
  const mi = parseInt(miStr, 10);
  const ss = parseInt(ssStr, 10);

  const esPM = /p/i.test(ampm);
  if (hh === 12) hh = esPM ? 12 : 0;
  else if (esPM) hh += 12;

  const fechaISO = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const horaLegible = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  // Concatenación numérica AAAAMMDDHHMMSS — ordena cronológicamente sin pasar por Date().
  const timestamp = (yyyy * 10000 + mm * 100 + dd) * 1_000_000 + (hh * 10000 + mi * 100 + ss);

  return { fechaISO, horaLegible, timestamp };
}
