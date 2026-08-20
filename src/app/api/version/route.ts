/**
 * app/api/version/route.ts
 *
 * Qué versión de la app está viva ahorita mismo.
 *
 * Todo el enredo de las fotos vino de no poder contestar dos preguntas:
 * "¿ya llegó el cambio que subí?" y "¿la app ya ve la llave del almacén?".
 * Sin respuesta se termina adivinando —redesplegando de más, o esperando
 * un despliegue que nunca salió— y cada vuelta cuesta minutos.
 *
 * Es público a propósito: se necesita justo cuando no se puede entrar al
 * panel, o desde fuera, para ver si un despliegue aterrizó. No devuelve
 * nada sensible: el número de la versión y sí/no de si cada pieza está
 * configurada, nunca las llaves.
 */

import { NextResponse } from 'next/server';

// Sin esto, Next lo resolvería al construir y contestaría siempre lo mismo
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    version: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    rama: process.env.VERCEL_GIT_COMMIT_REF || '',
    /** true = el almacén de fotos está conectado a ESTE despliegue */
    fotos: !!process.env.BLOB_READ_WRITE_TOKEN,
    /** Las otras piezas, por si algún día pasa lo mismo con ellas */
    hoja: !!process.env.GOOGLE_SHEETS_ID,
    avisos: !!process.env.TELEGRAM_BOT_TOKEN,
    ahora: new Date().toISOString(),
  });
}
