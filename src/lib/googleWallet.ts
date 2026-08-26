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

/**
 * El sitio, para el logo, los sellos y autorizar el enlace de guardado.
 *
 * NEXTAUTH_URL se ha guardado alguna vez sin el "https://" —el login lo
 * tolera, esto no—: una direccion sin protocolo dentro del pase no la
 * puede bajar Google, y la imagen simplemente no aparece, sin aviso. Por
 * eso se normaliza, y quien llama puede pasar el origen real de la
 * peticion, que es el dato mas confiable que hay.
 */
function normalizarSitio(valor?: string): string {
  const limpio = (valor || '').trim().replace(/\/$/, '');
  if (!limpio) return 'https://moramango.app';
  return /^https?:\/\//.test(limpio) ? limpio : `https://${limpio}`;
}

const SITIO = normalizarSitio(process.env.NEXTAUTH_URL);

export const walletListo = (): boolean =>
  !!process.env.GOOGLE_WALLET_ISSUER_ID && !!process.env.GOOGLE_PRIVATE_KEY;

const issuerId = () => (process.env.GOOGLE_WALLET_ISSUER_ID || '').trim();
const cuenta = () => (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
const llave = () => (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

/**
 * Versión del dibujo de los sellos. SUBIRLA al cambiar el diseño.
 *
 * Google guarda las imágenes en caché por dirección, y la de los sellos
 * se sirve con caché de un año. Sin este número, cambiar el dibujo no
 * llegaría nunca a quien ya tiene la tarjeta: Google seguiría mostrando
 * el que bajó la primera vez.
 *
 *   1 · círculos con números
 *   2 · logo a color y logo apagado
 *   3 · sellos verdes y dorados, sin letreros, fondo transparente
 */
const VERSION_SELLOS = 3;

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
    /**
     * El nombre escrito, arriba del todo.
     *
     * Google lo usa en vez del logo redondo más el texto del emisor, así
     * que el encabezado queda con la tipografía de la marca en lugar de
     * la suya.
     */
    wideProgramLogo: {
      sourceUri: { uri: `${SITIO}/logo-nombre-moramango.png` },
      contentDescription: {
        defaultValue: { language: 'es-MX', value: 'Moramango' },
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
function tarjeta(c: DatosCliente, sitio = SITIO) {
  const r = resumenTarjeta(c.pedidos, c.beneficio);
  return {
    id: idObjeto(c.id),
    classId: idClase(),
    state: 'ACTIVE',
    accountId: c.id,
    accountName: c.nombre || 'Cliente Moramango',
    loyaltyPoints: {
      label: 'Sellos',
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
    /**
     * Los diez sellos, dibujados por la app.
     *
     * El número va en la dirección porque Google guarda las imágenes en
     * caché: si fuera siempre la misma, el cliente vería los sellos de la
     * semana pasada aunque el conteo ya hubiera cambiado.
     */
    heroImage: {
      sourceUri: {
        uri: `${sitio}/api/wallet/sellos?n=${Math.min(c.pedidos, 10)}&v=${VERSION_SELLOS}`,
      },
      contentDescription: {
        defaultValue: {
          language: 'es-MX',
          value: `${Math.min(c.pedidos, 10)} de 10 sellos`,
        },
      },
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
export async function enlaceGuardar(c: DatosCliente, origen?: string): Promise<string> {
  await asegurarClase();
  const sitio = origen ? normalizarSitio(origen) : SITIO;

  /**
   * Antes de armar el enlace, refrescar la tarjeta que ya exista.
   *
   * Google NO pisa un pase que ya creo: si el cliente vuelve a guardar,
   * le devuelve el mismo de antes. Sin esto, cualquier cambio de diseno
   * —los sellos, por ejemplo— jamas llegaria a quien ya la tenia, y
   * borrarla del telefono tampoco ayuda porque el objeto sigue vivo del
   * lado de Google. Un 404 aqui solo dice que todavia no la ha guardado.
   */
  await actualizarTarjeta(c, sitio);

  const ahora = Math.floor(Date.now() / 1000);
  const payload = {
    iss: cuenta(),
    aud: 'google',
    typ: 'savetowallet',
    iat: ahora,
    origins: [sitio],
    payload: { loyaltyObjects: [tarjeta(c, sitio)] },
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
export async function actualizarTarjeta(c: DatosCliente, sitio = SITIO): Promise<boolean> {
  if (!walletListo() || !c.id) return false;
  try {
    const r = await pedir('PATCH', `/loyaltyObject/${idObjeto(c.id)}`, tarjeta(c, sitio));
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
