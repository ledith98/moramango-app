/**
 * cambios.ts
 *
 * Bitácora de cambios de la app, en español y para quien la usa — no es
 * el historial de git.
 *
 * Se escribe a mano a propósito: los mensajes de commit hablan de
 * archivos y funciones, y aquí lo que importa es qué cambió para quien
 * atiende el mostrador. Al agregar algo nuevo, va ARRIBA del arreglo.
 */

export type TipoCambio = 'nuevo' | 'mejora' | 'arreglo' | 'aviso';

export interface Cambio {
  /** YYYY-MM-DD */
  fecha: string;
  tipo: TipoCambio;
  titulo: string;
  detalle: string;
  /** Dónde verlo, para no tener que buscarlo */
  donde?: string;
}

export const ETIQUETA_TIPO: Record<TipoCambio, { texto: string; color: string }> = {
  nuevo: { texto: 'Nuevo', color: 'bg-green-100 text-green-800' },
  mejora: { texto: 'Mejora', color: 'bg-blue-100 text-blue-800' },
  arreglo: { texto: 'Arreglo', color: 'bg-amber-100 text-amber-800' },
  aviso: { texto: 'Ojo', color: 'bg-red-100 text-red-800' },
};

export const CAMBIOS: Cambio[] = [
  {
    fecha: '2026-07-22',
    tipo: 'mejora',
    titulo: 'Todo el texto más oscuro y legible',
    detalle:
      'Había textos en gris muy claro que no se alcanzaban a leer, sobre todo el buscador y el filtro de categorías en Insumos. Se oscureció el texto de toda la app y los campos de formulario ahora llevan color propio, para que no hereden grises. De aquí en adelante nada va en gris claro.',
    donde: 'Todo el panel y la tienda',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'Este apartado (APP)',
    detalle:
      'Aquí queda registrado todo lo que se le va cambiando a la aplicación, para que quien entre al panel sepa qué se movió sin tener que preguntar.',
    donde: 'APP',
  },
  {
    fecha: '2026-07-22',
    tipo: 'mejora',
    titulo: 'Lista de compras siempre a la mano',
    detalle:
      'Antes solo aparecía cuando ya había alertas de consumo, y esas necesitan semanas de ventas. Ahora se abre cuando quieras desde el botón, viene marcada con lo que está en cero o por acabarse, puedes palomear lo que falte y copiarla agrupada por categoría para recorrer la tienda por pasillos.',
    donde: 'Insumos → 🛒 Lista de compras',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'Recetario',
    detalle:
      'Ya se editan las recetas desde el panel, sin abrir Google Sheets. El insumo se elige de una lista y la unidad la pone él, así las cuentas de stock y costo siempre cuadran. Muestra cuánto cuesta hacer cada producto con los precios de compra reales y su margen.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'Tres estados por producto',
    detalle:
      'Además de mostrar u ocultar, ahora se puede pausar la venta dejando el producto a la vista: el cliente lo ve con "No disponible por el momento" y no lo puede agregar. Sirve para cuando se acabó hoy pero mañana vuelve.',
    donde: 'Productos',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'Aviso de últimas piezas y agotado',
    detalle:
      'La tienda calcula cuántas unidades alcanzan de cada producto según el stock y avisa "¡Últimas 3!" o "Agotado". El stock se aparta al hacer el pedido y se devuelve si se cancela, para que dos clientes no paguen la última pieza.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'El cliente avisa que ya llegó',
    detalle:
      'En su pedido aparece "🚗 Ya estoy afuera". El aviso llega solo a Telegram y además se le abre WhatsApp con el mensaje escrito. En Pedidos se marca con "YA LLEGÓ".',
    donde: 'Tienda → Mis pedidos',
  },
  {
    fecha: '2026-07-22',
    tipo: 'nuevo',
    titulo: 'Foto y emoji por producto',
    detalle:
      'Cada producto puede llevar su emoji o su foto. Si tiene foto, se muestra la foto. Los enlaces de Google Drive se traducen solos al formato que sí se ve.',
    donde: 'Productos → editar',
  },
  {
    fecha: '2026-07-22',
    tipo: 'arreglo',
    titulo: 'Los precios con centavos se leían mal',
    detalle:
      'La hoja está en español de España, donde el decimal es coma, y la app leía $52.50 como 52. Ningún precio estaba afectado porque todos son enteros, pero el primero con centavos se habría cobrado de menos. Ya quedó blindado.',
  },
  {
    fecha: '2026-07-22',
    tipo: 'mejora',
    titulo: 'Menú ordenado y sin categorías repetidas',
    detalle:
      '"Combos" y "COMBOS" salían como dos secciones distintas. Quedaron 6 categorías y el menú abre con Combos, Licuados y Jugos. Café se unió a Bebidas.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-07-21',
    tipo: 'nuevo',
    titulo: 'Insumos divididos en Biblioteca y Activos',
    detalle:
      'La Biblioteca guarda qué es cada insumo (cómo se compra, equivalencia, precio) y Activos cuánto hay. Registrar una compra suma al stock y actualiza el precio solo. Un insumo se puede guardar en la biblioteca sin usarlo por ahora.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-07-20',
    tipo: 'nuevo',
    titulo: 'Pago por transferencia',
    detalle:
      'El cliente puede pagar por transferencia con la CLABE a un toque y mandar su comprobante por WhatsApp. El pedido queda PENDIENTE hasta que se confirme que llegó el dinero.',
    donde: 'Tienda y Pedidos',
  },
  {
    fecha: '2026-07-20',
    tipo: 'nuevo',
    titulo: 'Cobro con terminal Mercado Pago',
    detalle:
      'Desde el punto de venta se manda el monto a la terminal. Ojo: hay que entrar también a la terminal para que se sincronice, y no acepta cobros menores a $5.',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-19',
    tipo: 'nuevo',
    titulo: 'Tarjeta de lealtad',
    detalle:
      'A los 5 pedidos el cliente gana 15% de descuento y a los 10 un artículo gratis. Se acumula por pedido, no por artículo.',
    donde: 'Tienda y Usuarios',
  },
  {
    fecha: '2026-07-19',
    tipo: 'nuevo',
    titulo: 'Avisos de pedido por Telegram',
    detalle:
      'Cada pedido nuevo llega al grupo de Telegram con sus productos, el total y cómo se pagó. Los combos incluyen su descripción para no tener que consultar el menú.',
  },
  {
    fecha: '2026-07-18',
    tipo: 'arreglo',
    titulo: 'La lealtad se guardaba en la columna equivocada',
    detalle:
      'Los contadores se escribían corridos una columna, así que ningún cliente podía canjear su beneficio. Se corrigió y se repararon las cuentas afectadas.',
  },
];
