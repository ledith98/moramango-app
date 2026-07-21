/**
 * mercadoPago.ts
 *
 * Integración con Mercado Pago Checkout Pro vía API REST (sin SDK).
 *
 * Flujo:
 * 1. Al confirmar un pedido con "Pagar en línea", el servidor crea una
 *    "preference" y el cliente es redirigido a init_point (checkout de MP).
 * 2. MP notifica el pago a /api/mp/webhook; ahí se consulta el pago con
 *    obtenerPago() y, si está aprobado, el pedido se marca como pagado.
 *
 * Si MP_ACCESS_TOKEN no está configurado, todo degrada a "pagar al
 * recoger" sin romper la compra.
 */

const MP_API = 'https://api.mercadopago.com';

export function mpConfigurado(): boolean {
  return !!process.env.MP_ACCESS_TOKEN;
}

interface DatosPreferencia {
  idPedido: string;
  descripcion: string;
  total: number;
  baseUrl: string;
}

export async function crearPreferencia({
  idPedido,
  descripcion,
  total,
  baseUrl,
}: DatosPreferencia): Promise<{ checkoutUrl: string } | null> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null;

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_reference: idPedido,
      items: [
        {
          id: idPedido,
          title: descripcion,
          quantity: 1,
          unit_price: Math.round(total * 100) / 100,
          currency_id: 'MXN',
        },
      ],
      back_urls: {
        success: `${baseUrl}/?pago=exito&pedido=${encodeURIComponent(idPedido)}`,
        pending: `${baseUrl}/?pago=pendiente&pedido=${encodeURIComponent(idPedido)}`,
        failure: `${baseUrl}/?pago=error&pedido=${encodeURIComponent(idPedido)}`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/mp/webhook`,
      statement_descriptor: 'MORAMANGO',
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text();
    console.error(`Error creando preference MP (${res.status}):`, cuerpo);
    return null;
  }

  const data = await res.json();
  if (!data.init_point) {
    console.error('Preference MP sin init_point:', data.id);
    return null;
  }

  return { checkoutUrl: data.init_point };
}

export async function obtenerPago(idPago: string): Promise<{
  status: string;
  external_reference: string;
} | null> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null;

  const res = await fetch(`${MP_API}/v1/payments/${idPago}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`Error consultando pago MP ${idPago}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return {
    status: data.status ?? '',
    external_reference: data.external_reference ?? '',
  };
}

// ── Terminal física (API Point) ───────────────────────────────────────────────

/**
 * Devuelve el device_id de la terminal Point a usar. Se puede fijar con
 * MP_POINT_DEVICE_ID; si no, toma la primera terminal en modo integrado
 * (PDV) que tenga la cuenta.
 *
 * En vez de devolver solo `null` cuando algo falla, distingue la causa
 * (token faltante, token inválido, ninguna terminal, ninguna en modo
 * integrado) para que el admin sepa exactamente qué revisar.
 */
export async function obtenerDeviceIdPoint(): Promise<{ id: string } | { error: string }> {
  if (process.env.MP_POINT_DEVICE_ID) return { id: process.env.MP_POINT_DEVICE_ID };
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'MP_ACCESS_TOKEN no está configurado en el servidor.' };

  const res = await fetch(`${MP_API}/point/integration-api/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    return {
      error:
        'El token de Mercado Pago no es válido (revisa MP_ACCESS_TOKEN en Vercel: debe ser el Access Token, no el Public Key).',
    };
  }
  if (!res.ok) {
    return { error: `Mercado Pago respondió ${res.status} al consultar la terminal.` };
  }

  const data = await res.json();
  const devices = data.devices || [];
  if (devices.length === 0) {
    return { error: 'Tu cuenta de Mercado Pago no tiene ninguna terminal Point vinculada.' };
  }

  const dev = devices.find((d: { operating_mode: string }) => d.operating_mode === 'PDV');
  if (!dev) {
    const modos = devices.map((d: { operating_mode: string }) => d.operating_mode).join(', ');
    return {
      error: `La terminal no está en modo integrado (PDV). Modo actual: ${modos || 'desconocido'}. Actívala desde la app de Mercado Pago en la Point.`,
    };
  }
  return { id: dev.id };
}

/**
 * Crea una intención de pago en la terminal: la Point "despierta" y pide
 * la tarjeta por el monto indicado. Monto en pesos (se convierte a
 * centavos internamente).
 */
export async function crearIntentoPagoPoint(
  deviceId: string,
  montoPesos: number,
  externalReference: string
): Promise<{ id?: string; error?: string }> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'Mercado Pago no está configurado' };

  const res = await fetch(`${MP_API}/point/integration-api/devices/${deviceId}/payment-intents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(montoPesos * 100),
      additional_info: { external_reference: externalReference, print_on_terminal: true },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('Error creando intento Point', res.status, JSON.stringify(data));
    return { error: data?.message || `Error ${res.status} de la terminal` };
  }
  return { id: data.id };
}

/**
 * Consulta el estado de una intención de pago. Devuelve un resultado
 * simplificado para el punto de venta.
 */
export async function obtenerIntentoPagoPoint(
  intentId: string
): Promise<{ resultado: 'aprobado' | 'rechazado' | 'cancelado' | 'error' | 'pendiente'; estado: string; paymentId?: string }> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { resultado: 'error', estado: 'SIN_TOKEN' };

  const res = await fetch(`${MP_API}/point/integration-api/payment-intents/${intentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { resultado: 'error', estado: `HTTP_${res.status}` };

  const data = await res.json().catch(() => null);
  const estado = data?.state || '';
  const payment = data?.payment;

  let resultado: 'aprobado' | 'rechazado' | 'cancelado' | 'error' | 'pendiente' = 'pendiente';
  if (estado === 'FINISHED') {
    // Aprobado salvo que el pago traiga un status distinto de approved
    resultado = payment?.status && payment.status !== 'approved' ? 'rechazado' : 'aprobado';
  } else if (estado === 'CANCELED') {
    resultado = 'cancelado';
  } else if (estado === 'ERROR' || estado === 'ABANDONED') {
    resultado = estado === 'ABANDONED' ? 'cancelado' : 'error';
  }

  return { resultado, estado, paymentId: payment?.id ? String(payment.id) : undefined };
}

/** Cancela una intención de pago pendiente en la terminal. */
export async function cancelarIntentoPagoPoint(deviceId: string, intentId: string): Promise<boolean> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return false;
  const res = await fetch(
    `${MP_API}/point/integration-api/devices/${deviceId}/payment-intents/${intentId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok;
}

/**
 * Base pública de la app derivada de la petición (Vercel setea los
 * headers x-forwarded-*). Necesaria para back_urls y notification_url.
 */
export function baseUrlDesdeRequest(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
