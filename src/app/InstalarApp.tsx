'use client';

/**
 * InstalarApp.tsx
 *
 * Dos cosas que hacen que moramango.app se pueda tener como aplicación.
 *
 *   1. Registra el ayudante (public/sw.js). Su sola existencia es lo que
 *      hace que Android ofrezca "Instalar aplicación" en vez de
 *      esconderlo en el menú de tres puntos.
 *   2. Enseña el botón cuando el navegador dice que se puede instalar.
 *
 * Por qué importa para el local: 93 de cada 100 pedidos se levantan en el
 * mostrador. Un cliente que se instala la tienda vuelve a abrirla con un
 * toque desde su pantalla, sin escribir la dirección ni buscarla. Es la
 * diferencia entre un menú que se visita una vez y uno que se queda.
 *
 * No pinta nada hasta que el navegador avisa que se puede instalar, así
 * que en iPhone y en escritorio no estorba: ahí Chrome nunca lanza el
 * evento y el componente se queda invisible.
 */

import { useEffect, useState } from 'react';

/** El evento que Chrome lanza cuando la página se puede instalar. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const RECORDATORIO = 'moramango-instalar-pospuesto';

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Si falla no pasa nada: la tienda funciona igual, solo que sin
      // poder instalarse. No vale la pena molestar a nadie con el error.
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const alPoder = (e: Event) => {
      // Sin esto, Chrome enseña su propia barrita y no deja elegir cuándo
      e.preventDefault();
      try {
        if (localStorage.getItem(RECORDATORIO)) return;
      } catch {
        // Navegador con el almacenamiento bloqueado: se ofrece igual
      }
      setEvento(e as EventoInstalar);
    };

    window.addEventListener('beforeinstallprompt', alPoder);
    // Ya instalada: que no vuelva a ofrecerse
    window.addEventListener('appinstalled', () => setEvento(null));
    return () => window.removeEventListener('beforeinstallprompt', alPoder);
  }, []);

  if (!evento) return null;

  const instalar = async () => {
    setOcupado(true);
    try {
      await evento.prompt();
      await evento.userChoice;
    } catch {
      // El navegador ya cerró el diálogo; no hay nada que rescatar
    }
    // El evento sirve UNA vez: usado o rechazado, ya no se puede repetir
    setEvento(null);
    setOcupado(false);
  };

  const ahoraNo = () => {
    try {
      localStorage.setItem(RECORDATORIO, '1');
    } catch {
      // Sin almacenamiento se volverá a ofrecer la próxima visita
    }
    setEvento(null);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md bg-white border border-neutral-200 rounded-2xl shadow-lg p-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192x192.png" alt="" className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-neutral-900 text-sm">Ten Moramango a la mano</p>
          <p className="text-xs text-neutral-700">
            Se guarda en tu pantalla y abre de un toque.
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={instalar}
            disabled={ocupado}
            className="bg-marron text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-50"
          >
            Instalar
          </button>
          <button onClick={ahoraNo} className="text-xs text-neutral-600 font-semibold">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
