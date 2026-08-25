/**
 * googleWallet.ts
 *
 * La tarjeta de lealtad dentro de Google Wallet.
 *
 * Lo que gana el negocio no es la tarjeta en sí, es que se actualiza sola:
 * al registrar una venta, el "3 de 5" del teléfono del cliente cambia sin
 * que él abra nada, y Google puede avisarle en la pantalla de bloqueo
 * cuando junta su premio o cuando pasa cerca del local.
 *
 * Cómo funciona, en corto:
 *
 *   CLASE    la plantilla del programa: nombre, logo, colores. Una sola,
 *            para todos los clientes.
 *   OBJETO   la tarjeta de UN cliente: sus pedidos, su premio, su QR.
 *
 * El objeto NO se crea por adelantado. Viaja dentro del enlace de
 * "Guardar en Google Wallet" y Google lo crea cuando el cliente lo
 * guarda. Crearlos antes llenaría la cuenta de tarjetas de gente que
 * nunca la quiso.
 *
 * Necesita GOOGLE_WALLET_ISSUER_ID (el número que da la consola de Google
 * Wallet). Sin eso todo queda apagado y la app no se entera: nada de esto
 * puede tumbar una venta.
 */

import crypto from 'crypto';
import { google } from 'googleapis';
import { resumenTarjeta } from './tarjetaLealtad';

const BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

/** El sitio, para el logo y para autorizar el enlace de guardado. */
const SITIO = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'https://moramango.app';

export const walletListo = (): boolean =>
  !!process.env.GOOGLE_WALLET_ISSUER_ID && !!process.env.GOOGLE_PRIVATE_KEY;

const issuerId = () => (process.env.GOOGLE_WALLET_ISSUER_ID || '').trim();
const cuenta = () => (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
const llave = () => (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

/** Un solo programa para todos: la plantilla de la tarjeta. */
export const idClase = () => `${issuerId()}.moramango-lealtad`;

/**
 * El id del objeto solo admite letras, números, punto, guion y guion bajo.
 * Un correo o un nombre romperían la llamada, así que se limpia.
 */
export const idObjeto = (idUsuario: string) =>
  `${issuerId()}.cliente-${idUsuario.replace(/[^a-zA-Z0-9._-]/g, '')}`;

async function token(): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: cuenta(), private_key: llave() },
    scopes: [SCOPE],
  });
  const cliente = await auth.getClient();
  const t = await cliente.getAccessToken();
  const valor = typeof t === 'string' ? t : t?.token;
  if (!valor) throw new Error('No se pudo autenticar con Google Wallet');
  return valor;
}

async function pedir(
  metodo: 'GET' | 'POST' | 'PATCH',
  ruta: string,
  cuerpo?: unknown
): Promise<{ ok: boolean; status: number; datos: unknown }> {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, datos };
}

/** La plantilla del programa. Se crea una vez; después no se toca. */
function plantilla() {
  return {
    id: idClase(),
    issuerName: 'Moramango',
    programName: 'Moramango — Blend to Go',
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: '#5c3a21',
    programLogo: {
      sourceUri: { uri: `${SITIO}/icon-512x512.png` },
      contentDescription: {
        defaultValue: { language: 'es-MX', value: 'Logo de Moramango' },
      },
    },
    textModulesData: [
      {
        id: 'como-funciona',
        header: 'Cómo funciona',
        body: 'Juntas 1 sello por pedido. A los 5 pedidos tienes 15% de descuento; a los 10, un artículo gratis de hasta $35. Se acumula solo, con pedir por la app o en el mostrador.',
      },
    ],
    linksModuleData: {
      uris: [
        { uri: SITIO, description: 'Pedir en línea', id: 'tienda' },
      ],
    },
  };
}

/**
 * Deja la plantilla creada si no existía.
 *
 * Idempotente a propósito: se llama antes de cada enlace de guardado y no
 * hay que acordarse de prepararla en ningún lado. Un 409 significa que ya
 * estaba, que es justo lo que se quería.
 */
export async function asegurarClase(): Promise<void> {
  const existe = await pedir('GET', `/loyaltyClass/${idClase()}`);
  if (existe.ok) return;
  const creada = await pedir('POST', '/loyaltyClass', plantilla());
  if (!creada.ok && creada.status !== 409) {
    throw new Error(
      `No se pudo crear la plantilla de la tarjeta (${creada.status}): ${JSON.stringify(creada.datos).slice(0, 200)}`
    );
  }
}

export interface DatosCliente {
  id: string;
  nombre: string;
  pedidos: number;
  beneficio: string;
}

/** La tarjeta de un cliente, con lo mismo que ve en la app. */
function tarjeta(c: DatosCliente) {
  const r = resumenTarjeta(c.pedidos, c.beneficio);
  return {
    id: idObjeto(c.id),
    classId: idClase(),
    state: 'ACTIVE',
    accountId: c.id,
    accountName: c.nombre || 'Cliente Moramango',
    loyaltyPoints: {
      label: 'Pedidos',
      balance: { string: r.avance },
    },
    secondaryLoyaltyPoints: {
      label: r.tienePremio ? 'Tu premio' : 'Para tu premio',
      balance: { string: r.premio },
    },
    /**
     * El QR lleva el ID del cliente para que en el mostrador se escanee
     * en vez de buscarlo por nombre. Debajo va el texto por si el lector
     * falla o el teléfono trae la pantalla rota.
     */
    barcode: {
      type: 'QR_CODE',
      value: c.id,
      alternateText: c.id,
    },
  };
}

/**
 * El enlace de "Guardar en Google Wallet".
 *
 * El objeto viaja firmado dentro del enlace: Google lo crea al guardarlo.
 * `origins` limita desde qué sitio vale, para que el enlace no sirva
 * pegado en otro lado.
 */
export async function enlaceGuardar(c: DatosCliente): Promise<string> {
  await asegurarClase();

  const ahora = Math.floor(Date.now() / 1000);
  const payload = {
    iss: cuenta(),
    aud: 'google',
    typ: 'savetowallet',
    iat: ahora,
    origins: [SITIO],
    payload: { loyaltyObjects: [tarjeta(c)] },
  };

  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const sinFirma = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}`;
  const firma = crypto.createSign('RSA-SHA256').update(sinFirma).sign(llave(), 'base64url');

  return `https://pay.google.com/gp/v/save/${sinFirma}.${firma}`;
}

/**
 * Actualiza la tarjeta que el cliente ya tiene guardada.
 *
 * Un 404 no es un error: quiere decir que nunca la guardó, y no hay nada
 * que actualizar. Nunca lanza — esto corre pegado al registro de una
 * venta, y una venta no se puede perder porque Google no conteste.
 */
export async function actualizarTarjeta(c: DatosCliente): Promise<boolean> {
  if (!walletListo() || !c.id) return false;
  try {
    const r = await pedir('PATCH', `/loyaltyObject/${idObjeto(c.id)}`, tarjeta(c));
    if (r.status === 404) return false;
    if (!r.ok) {
      console.error('Google Wallet no aceptó la actualización:', r.status, r.datos);
      return false;
    }
    return true;
  } catch (error) {
    console.error('No se pudo actualizar la tarjeta de Google Wallet:', error);
    return false;
  }
}
