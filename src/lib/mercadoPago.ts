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
