/**
 * pedidoFecha.ts
 *
 * Fecha_Hora en PEDIDOS se guarda con toLocaleString('es-MX', {...}),
 * formato "D/M/AAAA, HH:MM:SS" — ambiguo para `new Date(string)` (Node
 * lo interpreta como M/D/AAAA). En cambio el ID_Pedido trae la fecha
 * embebida sin ambigüedad: PED-YYMMDD-HHMMSS-NNN.
 *
 * Todo el filtrado/ordenado por día y hora se hace a partir del ID,
 * nunca parseando Fecha_Hora.
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

export function fechaCortaDesdeISO(fechaISO: string): string {
  // "2026-07-09" -> "260709"
  const [yyyy, mm, dd] = fechaISO.split('-');
  return `${yyyy.slice(2)}${mm}${dd}`;
}

export interface InfoFechaPedido {
  fechaCorta: string; // YYMMDD
  horaCorta: string; // HHMMSS
  fechaISO: string; // YYYY-MM-DD
  timestamp: number; // para ordenar
}

export function extraerFechaPedido(idPedido: string): InfoFechaPedido | null {
  const match = /^PED-(\d{6})-(\d{6})-\d+$/.exec(idPedido ?? '');
  if (!match) return null;

  const [, fechaCorta, horaCorta] = match;
  const yy = fechaCorta.slice(0, 2);
  const mm = fechaCorta.slice(2, 4);
  const dd = fechaCorta.slice(4, 6);
  const hh = horaCorta.slice(0, 2);
  const mi = horaCorta.slice(2, 4);
  const ss = horaCorta.slice(4, 6);

  const fechaISO = `20${yy}-${mm}-${dd}`;
  const timestamp = new Date(`${fechaISO}T${hh}:${mi}:${ss}`).getTime();

  return { fechaCorta, horaCorta, fechaISO, timestamp };
}
