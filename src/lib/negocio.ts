/**
 * negocio.ts
 *
 * Datos y helpers del negocio SEGUROS PARA EL CLIENTE: solo lee
 * variables NEXT_PUBLIC_* y hace lógica de strings, sin dependencias de
 * servidor. Se puede importar tanto en API routes como en componentes
 * 'use client' (tienda y panel).
 */

// ── Método de pago en línea ──────────────────────────────────────────────────
// Antes se guardaba como "Mercado Pago", pero confundía porque la terminal y
// las transferencias también pasan por Mercado Pago. El nombre visible ahora
// es "Pago en línea"; el valor viejo se sigue reconociendo.
export const METODO_PAGO_EN_LINEA = 'Pago en línea';

export const normalizarMetodoPago = (m: string | undefined | null): string =>
  m === 'Mercado Pago' ? METODO_PAGO_EN_LINEA : (m || '');

// ── Transferencia (SPEI) ─────────────────────────────────────────────────────
export const TRANSFERENCIA = {
  clabe: process.env.NEXT_PUBLIC_TRANSFER_CLABE || '',
  titular: process.env.NEXT_PUBLIC_TRANSFER_TITULAR || '',
  banco: process.env.NEXT_PUBLIC_TRANSFER_BANCO || '',
};
export const TRANSFERENCIA_HABILITADA = TRANSFERENCIA.clabe.length > 0;

// ── WhatsApp ─────────────────────────────────────────────────────────────────
/** Link wa.me con mensaje pre-escrito; abre el chat directo con ese número. */
export const linkWhatsApp = (telefono: string, mensaje: string): string =>
  `https://wa.me/${(telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;

const primerNombre = (nombre: string) => (nombre || '').trim().split(' ')[0] || 'Hola';

/** Mensaje para mandarle al cliente los datos de transferencia. */
export function mensajeTransferencia(nombre: string, total?: number): string {
  const monto = total && total > 0 ? ` de $${total.toFixed(2)}` : '';
  return (
    `¡Hola ${primerNombre(nombre)}! 💛 Aquí están los datos para tu pago por transferencia${monto} en Moramango:\n\n` +
    `CLABE: ${TRANSFERENCIA.clabe}\n` +
    (TRANSFERENCIA.titular ? `Titular: ${TRANSFERENCIA.titular}\n` : '') +
    (TRANSFERENCIA.banco ? `Banco: ${TRANSFERENCIA.banco}\n` : '') +
    `\nCuando hagas la transferencia, mándanos tu comprobante por aquí. ¡Gracias! 🥭`
  );
}
