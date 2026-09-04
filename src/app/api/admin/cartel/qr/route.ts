/**
 * app/api/admin/cartel/qr/route.ts
 *
 * El código QR del cartel, como imagen.
 *
 * Se genera aquí y no dentro de la página porque la librería de QR
 * rompe el render de un componente de servidor en Next 16 —
 * "ArrayBuffer is not detachable" al mandar el resultado al navegador.
 * En una ruta el SVG sale como respuesta y no pasa por ese camino.
 *
 * De paso queda mejor: el navegador lo cachea como cualquier imagen, y
 * el cartel se puede reimprimir sin volver a calcularlo.
 */

import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getAdminSession } from '@/lib/roles';

/** A dónde manda el código. El dominio propio, no la URL de Vercel. */
export const SITIO_PUBLICO = 'https://moramango.app';

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  /*
    Corrección alta y margen chico: el cartel se pega en una pared y se
    escanea desde medio metro, a veces con reflejo o con el papel
    arrugado. 'H' aguanta que un tercio del código esté tapado.
  */
  const svg = await QRCode.toString(SITIO_PUBLICO, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#3b2412', light: '#ffffff' },
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // La dirección no cambia; que no se recalcule en cada impresión
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
