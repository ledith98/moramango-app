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
// La CLABE va como default en el código (igual que teléfono/dirección):
// es un dato para RECIBIR pagos que la app le muestra a cualquier
// cliente, no un secreto. Las env vars NEXT_PUBLIC_TRANSFER_* la
// sobreescriben si algún día cambia la cuenta.
export const TRANSFERENCIA = {
  clabe: process.env.NEXT_PUBLIC_TRANSFER_CLABE || '722969010431364258',
  titular: process.env.NEXT_PUBLIC_TRANSFER_TITULAR || 'Moramango',
  banco: process.env.NEXT_PUBLIC_TRANSFER_BANCO || 'Mercado Pago (STP)',
};
export const TRANSFERENCIA_HABILITADA = TRANSFERENCIA.clabe.length > 0;

// ── WhatsApp ─────────────────────────────────────────────────────────────────
/** Teléfono del negocio (a donde el cliente manda su comprobante). */
export const TELEFONO_NEGOCIO = process.env.NEXT_PUBLIC_NEGOCIO_TELEFONO || '8186003207';

/** Link wa.me con mensaje pre-escrito; abre el chat directo con ese número. */
export const linkWhatsApp = (telefono: string, mensaje: string): string =>
  `https://wa.me/${(telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;

/**
 * Mensaje que el CLIENTE manda al negocio con su comprobante de
 * transferencia. Lleva el número de pedido para que el admin sepa cuál
 * confirmar (mismo id que va en el concepto de la transferencia).
 */
export function mensajeComprobante(idPedido: string, total?: number): string {
  const monto = total && total > 0 ? ` de $${total.toFixed(2)}` : '';
  return (
    `¡Hola! 🥭 Ya hice mi transferencia${monto} del pedido ${idPedido}. ` +
    `Aquí les mando mi comprobante 👇`
  );
}

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
