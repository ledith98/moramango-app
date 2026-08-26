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
const APAGADO = '#d6c6b1';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.max(
    0,
    Math.min(META_ARTICULO, parseInt(url.searchParams.get('n') || '0', 10) || 0)
  );

  /**
   * El logo se pide por dirección absoluta y no se lee del disco: en
   * Vercel la carpeta public la sirve la red de entrega, y el código de
   * servidor no siempre la tiene como archivo. El origen sale de la
   * petición, así que funciona igual en local y en producción.
   */
  const logo = `${url.origin}/icon-512x512.png`;

  /**
   * Diez sellos en dos filas de cinco.
   *
   * Son diez y no cinco porque el ciclo completo es de diez: a los cinco
   * hay premio pero no se reinicia. Mostrar solo cinco escondería la mitad
   * del camino, y mostrar diez sin señalar el quinto escondería que ya hay
   * algo a la mitad. Por eso los dos premios llevan letrero abajo, fuera
   * del círculo: dentro no cabe "GRATIS" sin encimarse.
   */
  const sello = (i: number) => {
    const lleno = i <= n;
    const esPremio = i === META_DESCUENTO || i === META_ARTICULO;
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 92,
            height: 92,
            borderRadius: 46,
            background: lleno ? '#ffffff' : 'transparent',
            border: lleno
              ? `4px solid ${esPremio ? AMBAR : '#e6d9c6'}`
              : `4px dashed ${esPremio ? AMBAR : APAGADO}`,
          }}
        >
          {/*
            El mismo logo en los dos estados, apagado cuando el sello
            todavía no se gana. Un logo desvanecido se lee como "aquí va a
            ir uno" mejor que un hueco vacío, y de paso la marca aparece
            diez veces en la tarjeta.
          */}
          <img
            src={logo}
            width={lleno ? 70 : 56}
            height={lleno ? 70 : 56}
            style={{ opacity: lleno ? 1 : 0.15 }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 8,
            height: 22,
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
          gap: 10,
          background: CREMA,
          padding: 20,
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
