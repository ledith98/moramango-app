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
 * ?n=3 → los tres primeros sellos llenos, los otros siete vacíos.
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
 * NO incluye símbolos como ✓ ni emojis — salen como cuadritos. Por eso
 * cada sello lleva su número, que sí existe en cualquier tipografía.
 */

import { ImageResponse } from 'next/og';
import { META_ARTICULO, META_DESCUENTO } from '@/lib/lealtad';

/** Medida que recomienda Google para la portada (aprox. 3:1). */
const ANCHO = 1032;
const ALTO = 336;

const CAFE = '#5c3a21';
const CREMA = '#f7f1e8';
const AMBAR = '#e0a106';
const APAGADO = '#c9b8a3';

export async function GET(req: Request) {
  const n = Math.max(
    0,
    Math.min(META_ARTICULO, parseInt(new URL(req.url).searchParams.get('n') || '0', 10) || 0)
  );

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
    const color = esPremio ? AMBAR : CAFE;
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
            width: 86,
            height: 86,
            borderRadius: 43,
            background: lleno ? color : 'transparent',
            border: lleno ? 'none' : `5px dashed ${esPremio ? AMBAR : APAGADO}`,
            color: lleno ? '#ffffff' : APAGADO,
            fontSize: 38,
            fontWeight: 700,
          }}
        >
          {i}
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
