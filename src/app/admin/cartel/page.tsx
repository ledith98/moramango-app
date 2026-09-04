'use client';

/**
 * app/admin/cartel/page.tsx
 *
 * El cartel del mostrador, listo para imprimir.
 *
 * 93 de cada 100 pedidos se levantan en el mostrador. La tienda en línea
 * lleva semanas viva y trajo 22 pedidos, sin que nada la anuncie: no hay
 * un letrero, un QR ni una liga a la vista en el local.
 *
 * Esto no es marketing para traer gente nueva —eso es la ficha de Google
 * Maps—. Es para la gente que YA está enfrente: que se lleve el menú en
 * el teléfono, junte sellos y vuelva.
 *
 * Se imprime desde el navegador: no hay que diseñar nada ni pagar una
 * imprenta. Sale en una hoja carta y se pega junto a la caja.
 *
 * Componente de cliente, como el resto del panel. Leer los ajustes aquí
 * con leerAjustes() arrastra googleapis al render del servidor y lo
 * revienta ("ArrayBuffer is not detachable"); el resto del panel ya pide
 * sus datos por API y esto hace lo mismo. El candado de administrador lo
 * pone admin/layout.tsx para todo lo que cuelga de /admin.
 */

import { useEffect, useState } from 'react';
import { TELEFONO_NEGOCIO } from '@/lib/negocio';

export default function CartelPage() {
  const [direccion, setDireccion] = useState('');

  useEffect(() => {
    fetch('/api/admin/ajustes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDireccion(d?.direccion ?? ''))
      // Sin dirección el cartel sirve igual; no vale un mensaje de error
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-2">
        <h1 className="text-2xl font-bold text-neutral-900">Cartel para el mostrador</h1>
        <p className="text-sm text-neutral-700">
          Imprímelo en una hoja carta y pégalo junto a la caja. El código manda a{' '}
          <strong className="text-neutral-900">moramango.app</strong>, donde el cliente ve el
          menú, pide y junta sellos.
        </p>
        <button
          onClick={() => window.print()}
          className="bg-marron text-white font-bold px-5 py-3 rounded-xl active:scale-95"
        >
          🖨️ Imprimir el cartel
        </button>
      </div>

      {/* La hoja. Fondo blanco y tinta oscura a propósito: se imprime. */}
      <div className="mx-auto w-full max-w-[21cm] bg-white text-neutral-900 border border-neutral-200 print:border-0 rounded-2xl print:rounded-none p-8 sm:p-12 text-center space-y-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-wide text-neutral-700">
            Pide desde tu teléfono
          </p>
          <h2 className="text-4xl sm:text-5xl font-black leading-tight">y no hagas fila</h2>
        </div>

        {/* Va como imagen y no incrustado: la librería que dibuja el
            código rompe el render de un componente de servidor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/api/admin/cartel/qr"
          alt="Código para abrir moramango.app"
          className="mx-auto w-56 h-56 sm:w-72 sm:h-72"
        />

        <div className="space-y-1">
          <p className="text-sm text-neutral-700">Apunta la cámara, o entra a</p>
          <p className="text-3xl sm:text-4xl font-black tracking-tight">moramango.app</p>
        </div>

        {/* La razón para escanearlo hoy, no algún día */}
        <div className="border-t border-b border-neutral-200 py-5 space-y-2">
          <p className="text-2xl font-bold">🎁 Junta 10 sellos</p>
          <p className="text-base text-neutral-800">
            Cada compra suma uno. Al llegar a 10, tu premio.
            <br />
            Se guarda solo en tu teléfono — no hay tarjetita que perder.
          </p>
        </div>

        <div className="text-sm text-neutral-700 space-y-0.5">
          <p className="font-bold text-base text-neutral-900">Moramango</p>
          {direccion && <p>{direccion}</p>}
          {TELEFONO_NEGOCIO && <p>{TELEFONO_NEGOCIO}</p>}
        </div>
      </div>
    </div>
  );
}
