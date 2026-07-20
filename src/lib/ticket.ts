/**
 * ticket.ts
 *
 * Genera el ticket de compra como imagen, dibujándolo en un <canvas>.
 * Sin librerías externas: pesa poco, funciona sin internet y el ticket
 * se ve idéntico al imprimirlo y al compartirlo por WhatsApp.
 *
 * Estilo: tipo ticket térmico (monoespaciado, separadores punteados),
 * pensado para imprimirse en rollo de 58/80mm o mandarse como imagen.
 *
 * Los datos del negocio se pueden sobreescribir con variables
 * NEXT_PUBLIC_NEGOCIO_* sin tocar el código.
 */

export const NEGOCIO = {
  nombre: process.env.NEXT_PUBLIC_NEGOCIO_NOMBRE || 'MORAMANGO',
  lema: 'Blend to Go',
  direccion:
    process.env.NEXT_PUBLIC_NEGOCIO_DIRECCION ||
    'Av. República Mexicana 1115-2, La Nogalera 2do Sector, 66417 San Nicolás de los Garza, N.L., México',
  telefono: process.env.NEXT_PUBLIC_NEGOCIO_TELEFONO || '8186003207',
  rfc: process.env.NEXT_PUBLIC_NEGOCIO_RFC || '',
  instagram: process.env.NEXT_PUBLIC_NEGOCIO_INSTAGRAM || 'moramango.mty',
  facebook: process.env.NEXT_PUBLIC_NEGOCIO_FACEBOOK || 'Moramango',
};

export interface ItemTicket {
  cantidad: number;
  nombre: string;
  subtotal: number;
}

export interface DatosTicket {
  idPedido: string;
  /** Fecha ya formateada, ej. "2026-07-14 16:25:30" */
  fecha: string;
  cliente?: string;
  items: ItemTicket[];
  totalBruto: number;
  descuento: number;
  total: number;
  metodoPago?: string;
  /** Ej: "Llevas 4 de 5 pedidos para tu 15% de descuento" */
  lealtad?: string;
}

// 576px ≈ ancho útil de un rollo térmico de 80mm. Si el rollo fuera de
// 58mm, bájalo a 384.
const ANCHO = 576;
const MARGEN = 24;
const NEGRO = '#111111';
const GRIS = '#555555';
const MONO = 'ui-monospace, "Courier New", monospace';

const dinero = (n: number) => `$${n.toFixed(2)}`;

function cargarLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/logo.png';
  });
}

/** Parte un texto en líneas que quepan en maxAncho. */
function envolver(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string[] {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string {
  if (ctx.measureText(texto).width <= maxAncho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxAncho) t = t.slice(0, -1);
  return t + '…';
}

export async function generarTicket(datos: DatosTicket): Promise<HTMLCanvasElement> {
  const logo = await cargarLogo();

  // Medir cuántas líneas ocupará la dirección para calcular la altura
  const medidor = document.createElement('canvas').getContext('2d')!;
  medidor.font = `bold 22px ${MONO}`;
  const lineasDir = NEGOCIO.direccion ? envolver(medidor, NEGOCIO.direccion, ANCHO - MARGEN * 2) : [];

  // Se dibuja en un lienzo holgado y al final se recorta a la altura real
  // del contenido: así el ticket nunca sale con papel en blanco de sobra,
  // sin depender de una estimación frágil.
  const altoMax =
    1050 + datos.items.length * 80 + lineasDir.length * 30 + (datos.lealtad ? 140 : 0);

  const escala = 2; // nitidez al imprimir
  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO * escala;
  lienzo.height = altoMax * escala;
  const ctx = lienzo.getContext('2d')!;
  ctx.scale(escala, escala);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ANCHO, altoMax);
  ctx.textBaseline = 'top';

  let y = MARGEN;
  const centro = ANCHO / 2;
  const derecha = ANCHO - MARGEN;

  const punteado = () => {
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(MARGEN, y);
    ctx.lineTo(derecha, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 16;
  };

  // ── Encabezado (con logo) ──
  if (logo) {
    const tam = 150;
    ctx.drawImage(logo, centro - tam / 2, y, tam, tam);
    y += tam + 20;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = NEGRO;
  ctx.font = `bold 44px ${MONO}`;
  ctx.fillText(NEGOCIO.nombre.toUpperCase(), centro, y);
  y += 48;

  ctx.fillStyle = GRIS;
  ctx.font = `bold 24px ${MONO}`;
  ctx.fillText(NEGOCIO.lema, centro, y);
  y += 36;

  ctx.fillStyle = NEGRO;
  ctx.font = `bold 24px ${MONO}`;
  ctx.fillText(datos.fecha, centro, y);
  y += 34;

  ctx.fillStyle = GRIS;
  ctx.font = `bold 22px ${MONO}`;
  for (const linea of lineasDir) {
    ctx.fillText(linea, centro, y);
    y += 28;
  }
  if (NEGOCIO.telefono) {
    ctx.fillText(`Tel: ${NEGOCIO.telefono}`, centro, y);
    y += 28;
  }
  if (NEGOCIO.rfc) {
    ctx.fillText(`RFC: ${NEGOCIO.rfc}`, centro, y);
    y += 28;
  }
  y += 8;
  punteado();

  // ── Datos del pedido ──
  ctx.textAlign = 'left';
  ctx.fillStyle = NEGRO;
  ctx.font = `bold 24px ${MONO}`;
  ctx.fillText(`TICKET: ${datos.idPedido}`, MARGEN, y);
  y += 30;
  if (datos.cliente) {
    ctx.fillText(recortar(ctx, `CLIENTE: ${datos.cliente}`, ANCHO - MARGEN * 2), MARGEN, y);
    y += 30;
  }
  y += 4;
  punteado();

  // ── Productos ──
  ctx.fillStyle = GRIS;
  ctx.font = `bold 20px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('CANT  PRODUCTO', MARGEN, y);
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL', derecha, y);
  y += 30;

  ctx.fillStyle = NEGRO;
  for (const item of datos.items) {
    ctx.font = `bold 26px ${MONO}`;
    ctx.textAlign = 'left';
    // Nombre en su propia línea (como el ticket de referencia)
    ctx.fillText(recortar(ctx, item.nombre, ANCHO - MARGEN * 2), MARGEN, y);
    y += 30;
    ctx.fillStyle = GRIS;
    ctx.font = `bold 22px ${MONO}`;
    ctx.fillText(`${item.cantidad}x`, MARGEN, y);
    ctx.fillStyle = NEGRO;
    ctx.textAlign = 'right';
    ctx.fillText(dinero(item.subtotal), derecha, y);
    y += 32;
  }
  y += 2;
  punteado();

  // ── Totales ──
  ctx.font = `bold 24px ${MONO}`;
  if (datos.descuento > 0) {
    ctx.fillStyle = GRIS;
    ctx.textAlign = 'left';
    ctx.fillText('SUBTOTAL:', MARGEN, y);
    ctx.textAlign = 'right';
    ctx.fillText(dinero(datos.totalBruto), derecha, y);
    y += 32;

    ctx.fillStyle = '#15803d';
    ctx.textAlign = 'left';
    ctx.fillText('DESCUENTO:', MARGEN, y);
    ctx.textAlign = 'right';
    ctx.fillText(`-${dinero(datos.descuento)}`, derecha, y);
    y += 34;
  }

  ctx.fillStyle = NEGRO;
  ctx.font = `bold 42px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL:', MARGEN, y);
  ctx.textAlign = 'right';
  ctx.fillText(dinero(datos.total), derecha, y);
  y += 50;
  punteado();

  if (datos.metodoPago) {
    ctx.fillStyle = NEGRO;
    ctx.font = `bold 22px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(`FORMA PAGO: ${datos.metodoPago.toUpperCase()}`, MARGEN, y);
    y += 32;
    punteado();
  }

  // ── Pie ──
  ctx.textAlign = 'center';
  ctx.fillStyle = NEGRO;
  ctx.font = `bold 26px ${MONO}`;
  ctx.fillText('GRACIAS POR SU COMPRA', centro, y);
  y += 34;

  if (datos.lealtad) {
    ctx.fillStyle = '#b45309';
    ctx.font = `bold 20px ${MONO}`;
    for (const linea of envolver(ctx, datos.lealtad, ANCHO - MARGEN * 2)) {
      ctx.fillText(linea, centro, y);
      y += 26;
    }
    y += 6;
  }

  ctx.fillStyle = GRIS;
  ctx.font = `bold 20px ${MONO}`;
  if (NEGOCIO.instagram) {
    ctx.fillText(`IG: @${NEGOCIO.instagram}`, centro, y);
    y += 26;
  }
  if (NEGOCIO.facebook) {
    ctx.fillText(`FB: ${NEGOCIO.facebook}`, centro, y);
    y += 26;
  }

  // Recortar a la altura real del contenido
  const altoReal = Math.min(y + MARGEN, altoMax);
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO * escala;
  canvas.height = altoReal * escala;
  const final = canvas.getContext('2d')!;
  final.fillStyle = '#ffffff';
  final.fillRect(0, 0, canvas.width, canvas.height);
  final.drawImage(lienzo, 0, 0);

  return canvas;
}

/**
 * Versión en TEXTO del ticket, para mandarla por WhatsApp directo al
 * número del cliente. (Un link wa.me solo puede llevar texto, no una
 * imagen; por eso el envío directo al número usa esta versión.)
 */
export function textoTicket(datos: DatosTicket): string {
  const lineas: string[] = [];
  lineas.push(`🥭 *${NEGOCIO.nombre.toUpperCase()}* — ${NEGOCIO.lema}`);
  lineas.push(datos.fecha);
  lineas.push(`Ticket: ${datos.idPedido}`);
  if (datos.cliente) lineas.push(`Cliente: ${datos.cliente}`);
  lineas.push('');
  for (const it of datos.items) {
    lineas.push(`${it.cantidad}x ${it.nombre} — $${it.subtotal.toFixed(2)}`);
  }
  lineas.push('');
  if (datos.descuento > 0) {
    lineas.push(`Subtotal: $${datos.totalBruto.toFixed(2)}`);
    lineas.push(`Descuento: -$${datos.descuento.toFixed(2)}`);
  }
  lineas.push(`*TOTAL: $${datos.total.toFixed(2)}*`);
  if (datos.metodoPago) lineas.push(`Pago: ${datos.metodoPago}`);
  lineas.push('');
  lineas.push('¡Gracias por tu compra! 💛');
  if (datos.lealtad) lineas.push(datos.lealtad);
  return lineas.join('\n');
}

/** Abre el diálogo de impresión con el ticket. */
export async function imprimirTicket(datos: DatosTicket): Promise<void> {
  const canvas = await generarTicket(datos);
  const url = canvas.toDataURL('image/png');
  const win = window.open('', '_blank', 'width=420,height=760');
  if (!win) {
    alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e intenta de nuevo.');
    return;
  }
  win.document.write(
    `<html><head><title>Ticket ${datos.idPedido}</title><style>
      /* Sin margen de página ni tope de ancho: la imagen ya viene al
         ancho justo del rollo (ver ANCHO en este archivo). Agregar
         márgenes o un max-width aquí hace que apps como RawBT vuelvan
         a reescalar la imagen y termine viéndose aplastada/angosta. */
      @page { margin: 0; }
      body { margin:0; background:#fff; }
      img { display:block; width:100%; height:auto; }
    </style></head><body>
      <img src="${url}" onload="window.focus();window.print();">
    </body></html>`
  );
  win.document.close();
}

/**
 * Comparte el ticket como imagen (WhatsApp, etc.). Si el dispositivo no
 * soporta compartir archivos (típico en escritorio), lo descarga.
 */
export async function compartirTicket(datos: DatosTicket): Promise<void> {
  const canvas = await generarTicket(datos);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return;

  const archivo = new File([blob], `ticket-${datos.idPedido}.png`, { type: 'image/png' });

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: `Ticket ${datos.idPedido}` });
      return;
    } catch {
      return; // el usuario canceló
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-${datos.idPedido}.png`;
  a.click();
  URL.revokeObjectURL(url);
}
