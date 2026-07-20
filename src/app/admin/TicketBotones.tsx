'use client';

import { useState } from 'react';
import { compartirTicket, DatosTicket, imprimirTicket, textoTicket } from '@/lib/ticket';
import { linkWhatsApp } from '@/lib/negocio';

/**
 * Botones para imprimir o enviar el ticket de un pedido.
 * Se usan tanto al cerrar una venta en el mostrador como desde el
 * detalle de cualquier pedido.
 *
 * Si el pedido trae `telefono`, "Enviar ticket" abre WhatsApp directo a
 * ese número con el ticket en texto listo para enviar (como los avisos
 * de estado). Un link de WhatsApp solo puede llevar texto, no la imagen,
 * así que el envío directo al número usa la versión de texto; sin
 * teléfono, se comparte la imagen por el menú de compartir del sistema.
 */
export function TicketBotones({
  datos,
  telefono,
  compacto = false,
}: {
  datos: DatosTicket;
  telefono?: string;
  compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState<'imprimir' | 'compartir' | null>(null);
  const tieneTelefono = !!(telefono && telefono.replace(/\D/g, '').length >= 8);

  const imprimir = async () => {
    setOcupado('imprimir');
    try {
      await imprimirTicket(datos);
    } catch (e) {
      console.error('Error imprimiendo ticket:', e);
      alert('No se pudo generar el ticket. Intenta de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  const enviar = async () => {
    // Con teléfono: WhatsApp directo al número con el ticket en texto
    if (tieneTelefono) {
      window.open(linkWhatsApp(telefono!, textoTicket(datos)), '_blank');
      return;
    }
    // Sin teléfono: compartir la imagen por el menú del sistema
    setOcupado('compartir');
    try {
      await compartirTicket(datos);
    } catch (e) {
      console.error('Error compartiendo ticket:', e);
      alert('No se pudo generar el ticket. Intenta de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  const base = compacto ? 'py-2 text-xs' : 'py-2.5 text-sm';

  return (
    <div className="flex gap-2">
      <button
        onClick={imprimir}
        disabled={ocupado !== null}
        className={`flex-1 ${base} font-semibold rounded-xl bg-neutral-100 text-neutral-700 active:scale-95 transition-transform disabled:opacity-50`}
      >
        {ocupado === 'imprimir' ? 'Generando...' : '🖨️ Imprimir'}
      </button>
      <button
        onClick={enviar}
        disabled={ocupado !== null}
        className={`flex-1 ${base} font-semibold rounded-xl bg-green-500 text-white active:scale-95 transition-transform disabled:opacity-50`}
      >
        {ocupado === 'compartir'
          ? 'Generando...'
          : tieneTelefono
          ? '📲 Enviar por WhatsApp'
          : '📲 Enviar ticket'}
      </button>
    </div>
  );
}
