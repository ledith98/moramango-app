'use client';

import { useState } from 'react';
import { compartirTicket, DatosTicket, imprimirTicket } from '@/lib/ticket';

/**
 * Botones para imprimir o compartir el ticket de un pedido, tanto al
 * cerrar una venta en el mostrador como desde el detalle de cualquier
 * pedido.
 *
 * "Enviar ticket" siempre comparte la IMAGEN por el menú del sistema
 * (WhatsApp, correo, etc.). Antes se intentaba enviarlo directo al
 * número registrado, pero WhatsApp no deja pre-adjuntar imágenes por
 * link — quedaba texto plano sin logo, se veía deslavado. Con la
 * impresora térmica el envío digital pasó a ser ocasional, así que
 * vale más que cuando se mande se vea profesional (con logo) aunque
 * el cajero tenga que elegir el contacto a mano.
 */
export function TicketBotones({
  datos,
  compacto = false,
}: {
  datos: DatosTicket;
  compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState<'imprimir' | 'compartir' | null>(null);

  const accion = async (tipo: 'imprimir' | 'compartir') => {
    setOcupado(tipo);
    try {
      if (tipo === 'imprimir') await imprimirTicket(datos);
      else await compartirTicket(datos);
    } catch (e) {
      console.error('Error generando ticket:', e);
      alert('No se pudo generar el ticket. Intenta de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  const base = compacto ? 'py-2 text-xs' : 'py-2.5 text-sm';

  return (
    <div className="flex gap-2">
      <button
        onClick={() => accion('imprimir')}
        disabled={ocupado !== null}
        className={`flex-1 ${base} font-semibold rounded-xl bg-neutral-100 text-neutral-700 active:scale-95 transition-transform disabled:opacity-50`}
      >
        {ocupado === 'imprimir' ? 'Generando...' : '🖨️ Imprimir'}
      </button>
      <button
        onClick={() => accion('compartir')}
        disabled={ocupado !== null}
        className={`flex-1 ${base} font-semibold rounded-xl bg-green-500 text-white active:scale-95 transition-transform disabled:opacity-50`}
      >
        {ocupado === 'compartir' ? 'Generando...' : '📲 Enviar ticket'}
      </button>
    </div>
  );
}
