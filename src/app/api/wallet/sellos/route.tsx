/**
 * app/api/wallet/sellos/route.tsx
 *
 * La tarjeta de sellos que se ve arriba de la tarjeta de Google Wallet.
 *
 * Google Wallet no deja acomodar iconos donde uno quiera: la plantilla es
 * fija y solo admite textos en lugares concretos. Lo único libre es la
 * imagen de portada, así que los diez sellos se DIBUJAN aquí y se le pasan
 * a Google como una imagen.
 *
 * ?n=3 → los tres primeros sellos con el logo a color, el resto apagados.
 *
 * El número va en la dirección a propósito: Google guarda las imágenes en
 * su caché por dirección, así que si fuera siempre la misma, el cliente
 * seguiría viendo los sellos de la semana pasada. Al cambiar n, cambia la
 * dirección y Google baja la nueva.
 *
 * Es pública porque Google la baja desde sus servidores, sin sesión. No
 * expone nada: es un dibujo de cuántos sellos lleva alguien, sin nombre ni
 * dato de nadie.
 *
 * Ojo con los caracteres: se dibuja con la tipografía que trae Next, que
 * NO incluye símbolos como ✓ ni emojis — salen como cuadritos. Solo se
 * usan letras y números, que existen en cualquier tipografía.
 */

import { ImageResponse } from 'next/og';
import { META_ARTICULO, META_DESCUENTO } from '@/lib/lealtad';

/** Medida que recomienda Google para la portada (aprox. 3:1). */
const ANCHO = 1032;
const ALTO = 336;

const CREMA = '#f7f1e8';
const AMBAR = '#e0a106';

/**
 * Las tres versiones del logo.
 *
 * El café y el dorado son dibujos aparte, no el de color teñido: en esas
 * versiones la mora va en blanco con el contorno marcado, y eso no sale
 * de recolorear píxeles. Si todavía no están en /public, se usa el de
 * color apagado — así la tarjeta nunca se rompe por un archivo que falta.
 */
const ARCHIVOS = {
  color: '/icon-512x512.png',
  cafe: '/logo-cafe.png',
  dorado: '/logo-dorado.png',
};

async function existe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.max(
    0,
    Math.min(META_ARTICULO, parseInt(url.searchParams.get('n') || '0', 10) || 0)
  );

  /**
   * Los logos se piden por dirección absoluta y no se leen del disco: en
   * Vercel la carpeta public la sirve la red de entrega, y el código de
   * servidor no siempre la tiene como archivo. El origen sale de la
   * petición, así que funciona igual en local y en producción.
   */
  const dir = (archivo: string) => `${url.origin}${archivo}`;
  const [hayCafe, hayDorado] = await Promise.all([
    existe(dir(ARCHIVOS.cafe)),
    existe(dir(ARCHIVOS.dorado)),
  ]);

  /**
   * Diez sellos en dos filas de cinco.
   *
   * Son diez y no cinco porque el ciclo completo es de diez: a los cinco
   * hay premio pero no se reinicia. Mostrar solo cinco escondería la mitad
   * del camino, y mostrar diez sin señalar el quinto escondería que ya hay
   * algo a la mitad. Por eso los dos premios llevan letrero abajo.
   */
  const sello = (i: number) => {
    const lleno = i <= n;
    const esPremio = i === META_DESCUENTO || i === META_ARTICULO;

    // Ganado: el logo a color. Por ganar: café, o dorado si ahí hay premio.
    let archivo = ARCHIVOS.color;
    let opacidad = 1;
    if (!lleno) {
      if (esPremio && hayDorado) archivo = ARCHIVOS.dorado;
      else if (!esPremio && hayCafe) archivo = ARCHIVOS.cafe;
      // Sin los archivos nuevos, el de color apagado hace el mismo papel
      else opacidad = 0.16;
    }

    return (
      <div
        key={i}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 118,
        }}
      >
        {/*
          Sin círculo detrás: el logo va directo sobre el fondo.

          El de color se dibuja más grande que los de contorno porque su
          archivo trae más margen interno: al mismo tamaño de caja, el
          dibujo sale más chico y el sello ganado se veía encogido junto a
          los que faltan.
        */}
        <img
          src={dir(archivo)}
          width={archivo === ARCHIVOS.color && lleno ? 106 : 92}
          height={archivo === ARCHIVOS.color && lleno ? 106 : 92}
          style={{ opacity: opacidad }}
        />
        <div
          style={{
            display: 'flex',
            marginTop: 4,
            height: 24,
            fontSize: 19,
            fontWeight: 700,
            color: esPremio ? AMBAR : 'transparent',
          }}
        >
          {i === META_DESCUENTO ? '15% OFF' : i === META_ARTICULO ? 'GRATIS' : '·'}
        </div>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          /**
           * El fondo se queda crema y no transparente. La tarjeta de
           * Google es café oscuro: sobre ese fondo, los sellos café serían
           * invisibles. La crema es lo que los deja verse.
           */
          background: CREMA,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex' }}>{[1, 2, 3, 4, 5].map(sello)}</div>
        <div style={{ display: 'flex' }}>{[6, 7, 8, 9, 10].map(sello)}</div>
      </div>
    ),
    {
      width: ANCHO,
      height: ALTO,
      headers: {
        // Un año: la dirección ya lleva el número, así que esta imagen
        // concreta nunca cambia. Sin caché, Google la volvería a pedir a
        // cada rato para nada.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  );
}
