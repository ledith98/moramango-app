/**
 * tarjetaLealtad.ts
 *
 * Qué dice la tarjeta de lealtad del cliente.
 *
 * Va aparte de quien la emite porque es lo único que hay que revisar con
 * calma: es el texto que el cliente ve en la pantalla de bloqueo de su
 * teléfono, sin la app abierta y sin nadie que se lo explique. Si ahí dice
 * algo confuso, no hay a quién preguntarle.
 *
 * Módulo puro: sirve igual para pintar la tarjeta en la app y para armar
 * la de Google Wallet, y así las dos dicen exactamente lo mismo. Que la
 * app diga "te faltan 2" y la tarjeta diga otra cosa sería peor que no
 * tener tarjeta.
 */

import { META_ARTICULO, META_DESCUENTO } from './lealtad';

export interface ResumenTarjeta {
  /** "3 de 5" — lo grande de la tarjeta */
  avance: string;
  /** Cuántos pedidos van en el ciclo */
  pedidos: number;
  /** A cuántos pedidos está el siguiente premio */
  meta: number;
  faltan: number;
  /** "Tienes 15% de descuento" o "Te faltan 2 pedidos para tu 15%" */
  premio: string;
  /** true = ya tiene algo que canjear */
  tienePremio: boolean;
}

/** Cómo se llama cada beneficio para el cliente, no para la hoja. */
export function nombreBonito(beneficio: string): string {
  if (beneficio === '15% Descuento') return '15% de descuento';
  if (beneficio === 'Articulo Gratis') return 'un artículo gratis (hasta $35)';
  if (beneficio.startsWith('Reactivacion:')) {
    const monto = parseFloat(beneficio.split(':')[1]) || 0;
    return `un cupón de $${monto.toFixed(0)}`;
  }
  return beneficio;
}

/**
 * El estado de la lealtad, dicho como se lo dirías a alguien en el
 * mostrador.
 *
 * La meta se mueve sola: antes de los 5 pedidos la siguiente parada es el
 * descuento, después es el artículo gratis. Mostrar siempre "de 10"
 * escondería que a los 5 ya hay premio, que es justo lo que hace que
 * alguien vuelva la cuarta vez.
 */
export function resumenTarjeta(pedidos: number, beneficio: string): ResumenTarjeta {
  const enCiclo = Math.max(0, pedidos);
  const meta = enCiclo < META_DESCUENTO ? META_DESCUENTO : META_ARTICULO;
  const faltan = Math.max(0, meta - enCiclo);
  const tienePremio = !!beneficio && beneficio !== 'Ninguno';

  const siguiente =
    meta === META_DESCUENTO ? '15% de descuento' : 'un artículo gratis (hasta $35)';

  let premio: string;
  if (tienePremio) {
    premio = `Tienes ${nombreBonito(beneficio)}`;
  } else if (faltan === 0) {
    // Llegó a la meta pero el beneficio todavía no se refleja: no se le
    // promete nada que la caja no vaya a reconocer.
    premio = 'Tu premio está en camino';
  } else if (faltan === 1) {
    premio = `Te falta 1 pedido para ${siguiente}`;
  } else {
    premio = `Te faltan ${faltan} pedidos para ${siguiente}`;
  }

  return {
    avance: `${Math.min(enCiclo, meta)} de ${meta}`,
    pedidos: enCiclo,
    meta,
    faltan,
    premio,
    tienePremio,
  };
}
