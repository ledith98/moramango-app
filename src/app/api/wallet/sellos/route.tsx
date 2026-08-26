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


/**
 * Las versiones del logo, una por estado del sello.
 *
 * El verde y el dorado son dibujos aparte, no el de color teñido: en esas
 * versiones la mora va hueca con el contorno marcado, y eso no sale de
 * recolorear píxeles. Si alguno falta en /public, se usa el de color
 * apagado — así la tarjeta nunca se rompe por un archivo que no está.
 *
 * El café existe pero ya no se usa para los pendientes: la tarjeta de
 * Google es café oscuro y, sobre ese fondo, un sello café es invisible.
 * El verde es lo que se ve.
 */
const ARCHIVOS = {
  color: '/icon-512x512.png',
  verde: '/logo-verde.png',
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
  const [hayVerde, hayDorado] = await Promise.all([
    existe(dir(ARCHIVOS.verde)),
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

    // Ganado: el logo a color. Por ganar: verde, o dorado si ahí hay premio.
    let archivo = ARCHIVOS.color;
    let opacidad = 1;
    if (!lleno) {
      if (esPremio && hayDorado) archivo = ARCHIVOS.dorado;
      else if (!esPremio && hayVerde) archivo = ARCHIVOS.verde;
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
          width: 200,
        }}
      >
        {/*
          Sin círculo detrás y sin letrero: el logo va directo sobre el
          fondo y se lleva todo el alto disponible. En la pantalla de un
          teléfono la tira se ve chiquita, así que cada píxel que se le
          quite al sello se nota.

          Los letreros de "15% OFF" y "GRATIS" se quitaron para ganar ese
          espacio. Lo que distingue a esos dos sigue siendo el color
          dorado, y el texto de la tarjeta —debajo de esta imagen— ya dice
          cuántos pedidos faltan y para qué premio.

          El de color se dibuja más grande que los de contorno porque su
          archivo trae más margen interno: al mismo tamaño de caja, el
          dibujo sale más chico y el sello ganado se veía encogido junto a
          los que faltan.
        */}
        <img
          src={dir(archivo)}
          width={archivo === ARCHIVOS.color && lleno ? 158 : 140}
          height={archivo === ARCHIVOS.color && lleno ? 158 : 140}
          style={{ opacity: opacidad }}
        />
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
          gap: 2,
          /**
           * Fondo transparente: los sellos se ven directo sobre el café de
           * la tarjeta, sin una tira clara que los encajone. Se puede
           * porque los pendientes son verdes — en café no se verían.
           */
          background: 'transparent',
          padding: 6,
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
