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
    fecha: '2026-08-02',
    tipo: 'mejora',
    titulo: 'La app abre más rápido',
    detalle:
      'La imagen de fondo del menú pesaba 734 KB y el logo 90 KB, cuando en pantalla se ven chiquitos. Ahora pesan 117 KB y 17 KB: son 690 KB menos que descarga el celular del cliente cada vez que entra, y se nota sobre todo con datos o en equipos lentos. También se dejó de consultar el mismo dato dos veces al abrir el menú.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-07-30',
    tipo: 'nuevo',
    titulo: 'Horario para recibir pedidos',
    detalle:
      'En Ajustes puedes poner de qué hora a qué hora se pueden hacer pedidos, día por día, y marcar los días que no abres. Fuera de ese horario el cliente ve el menú y arma su carrito, pero no puede mandar el pedido: le aparece a qué hora abres. Los pedidos en mostrador no se ven afectados. Viene apagado: mientras no lo actives y guardes, se puede pedir a cualquier hora igual que hasta hoy.',
    donde: 'Ajustes',
  },
  {
    fecha: '2026-07-30',
    tipo: 'nuevo',
    titulo: 'Tú decides qué grupo va primero en la tienda',
    detalle:
      'En Ajustes puedes subir y bajar los grupos de alimentos con las flechas, y así los verá el cliente al entrar. Quedó como Combos, Comida salada, Jugos, Licuados, Comida dulce y Bebidas, pero se cambia cuando quieras. Si más adelante creas un grupo nuevo, aparece al final de la lista para que lo acomodes.',
    donde: 'Ajustes',
  },
  {
    fecha: '2026-07-29',
    tipo: 'arreglo',
    titulo: 'Un teléfono, una sola cuenta',
    detalle:
      'El sistema comparaba los números tal cual, así que "8117850462" y "+52 8117850462" le parecían distintos y el mismo número podía quedar en dos cuentas. Ahora los reconoce como el mismo en cualquier formato. También se limpió el número que estaba repetido: se quedó en la cuenta que tiene las compras.',
    donde: 'Usuarios',
  },
  {
    fecha: '2026-07-29',
    tipo: 'nuevo',
    titulo: 'El artículo gratis se descuenta solo',
    detalle:
      'Cuando un cliente llega a sus 10 compras y aplicas su artículo gratis, ahora eliges de una lista cuál de los productos de la venta se lleva (solo aparecen los que están dentro del tope) y se descuenta solo del total. Ya no hay que restarlo a mano. Queda anotado en el pedido qué se regaló.',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-29',
    tipo: 'nuevo',
    titulo: 'Ajustes: el tope del artículo gratis lo decides tú',
    detalle:
      'Nuevo apartado Ajustes donde cambias el precio máximo del artículo gratis (antes estaba fijo en $35). Al escribir el monto te muestra en el momento qué productos entrarían con ese tope.',
    donde: 'Panel → Ajustes',
  },
  {
    fecha: '2026-07-29',
    tipo: 'nuevo',
    titulo: 'Ver las compras anteriores de un cliente',
    detalle:
      'Al abrir un pedido de un cliente registrado, el botón "Ver sus compras anteriores" muestra todo su historial: qué día y a qué hora compró, si fue en local o por la app, y cuánto ha gastado en total.',
    donde: 'Pedidos → abrir un pedido',
  },
  {
    fecha: '2026-07-29',
    tipo: 'arreglo',
    titulo: 'El cliente de mostrador ya queda registrado',
    detalle:
      'Antes, si vendías en el local escribiendo el nombre y teléfono de un cliente, no quedaba guardado: la próxima vez no lo encontrabas y su lealtad no acumulaba. Ahora, al registrar una venta con teléfono, el cliente se da de alta solo (o se liga al que ya existía con ese número), y empieza a acumular desde su primera compra. Reconoce el número aunque se escriba con o sin +52. Además se recuperaron las ventas que ya estaban registradas: 11 ventas quedaron ligadas a sus clientes y se dieron de alta 7 clientes con su avance de lealtad.',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-28',
    tipo: 'nuevo',
    titulo: 'Fecha de compra editable y borrar compras',
    detalle:
      'En Insumos, la columna "Última compra" ahora es "Fecha de compra" y puedes ponerla o cambiarla a mano con un calendario (útil para registrar cuándo compraste algo). Y en "Ver compras" puedes borrar una compra registrada por error con el bote de basura.',
    donde: 'Insumos activos',
  },
  {
    fecha: '2026-07-28',
    tipo: 'nuevo',
    titulo: 'Copiar el número del cliente desde Pedidos',
    detalle:
      'En el detalle de un pedido puedes tocar el teléfono del cliente para copiarlo, y así pegarlo en WhatsApp y mandarle su comprobante o ticket. Útil cuando no se hizo al momento de la venta. Ya existía en el punto de venta; ahora también en Pedidos.',
    donde: 'Pedidos → abrir un pedido',
  },
  {
    fecha: '2026-07-27',
    tipo: 'arreglo',
    titulo: 'Insumos ya no se vacían ni te sacan al inicio',
    detalle:
      'Al guardar insumos seguido, Google limitaba las lecturas y el panel se veía vacío (0 insumos) y a veces te regresaba al inicio de la app. Se arregló de dos formas: cuando Google limita, la app reintenta sola en vez de fallar; y el rol de administrador se lee mucho menos seguido (una vez cada pocos minutos en vez de dos veces por cada clic).',
    donde: 'Insumos y panel',
  },
  {
    fecha: '2026-07-27',
    tipo: 'arreglo',
    titulo: 'Guardar insumos ya no tarda ni se cuelga',
    detalle:
      'Al guardar un insumo, ingrediente o compra, la app hacía una escritura por cada dato (unas 8 seguidas), y cada una tardaba lo suyo; a veces se atoraba. Ahora manda todo en un solo envío, así que guarda mucho más rápido y estable.',
    donde: 'Insumos y Recetario',
  },
  {
    fecha: '2026-07-27',
    tipo: 'mejora',
    titulo: 'Inicio más limpio y "Mis pedidos" en tu perfil',
    detalle:
      'Se quitó el icono de pedidos del inicio para que se vea más despejado. Ahora el historial de pedidos está dentro de tu perfil: entras con tu cuenta (👤) y ahí ves "Mis pedidos".',
    donde: 'Tienda',
  },
  {
    fecha: '2026-07-26',
    tipo: 'mejora',
    titulo: 'Existencias solo para productos de reventa',
    detalle:
      'El aviso de "últimas piezas / agotado" ya no sale en los productos elaborados (sándwiches, jugos, licuados), donde no tiene sentido. Ahora se maneja con un campo Existencias por producto: en Productos → editar pones cuántas piezas hay de conchas, galletas, bites, etc., y la tienda muestra el aviso y descuenta con cada venta. Los elaborados se dejan sin existencias.',
    donde: 'Productos → editar',
  },
  {
    fecha: '2026-07-26',
    tipo: 'nuevo',
    titulo: 'Copiar el número del cliente al terminar la venta',
    detalle:
      'Si registras una venta con el teléfono del cliente, al terminar aparece un botón para copiar ese número, y así pegarlo en WhatsApp y mandarle su ticket digital.',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-26',
    tipo: 'nuevo',
    titulo: 'Botón de WhatsApp siempre a la vista',
    detalle:
      'En la tienda hay un icono verde de WhatsApp arriba a la derecha, siempre visible, para que cualquiera pueda escribirte por un pedido, una duda o información. Aparte, cada pedido sigue teniendo su propio botón de contacto.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-07-26',
    tipo: 'nuevo',
    titulo: 'El cliente puede cancelar y contactarte',
    detalle:
      'En "Mis pedidos" el cliente ahora tiene un botón para cancelar su pedido si se equivocó, pero solo mientras siga en "Recibido" y sin pagar; si ya pagó o ya entró a preparación, se le pide contactarte. También hay un botón "Contáctanos por WhatsApp" en cada pedido para dudas.',
    donde: 'Tienda → Mis pedidos',
  },
  {
    fecha: '2026-07-26',
    tipo: 'mejora',
    titulo: 'Punto de venta ordenado por secciones',
    detalle:
      'La pantalla de Venta ahora separa los datos en tarjetas: Datos del cliente, Cobro y Preparación, para que no se pierda todo junto.',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-26',
    tipo: 'mejora',
    titulo: 'Productos sin selector de emojis',
    detalle:
      'Se quitó el selector de emojis del editor de productos. Ahora se usa la foto del producto; si no tiene, se muestra el icono de su categoría.',
    donde: 'Productos → editar',
  },
  {
    fecha: '2026-07-25',
    tipo: 'nuevo',
    titulo: 'Corte de caja',
    detalle:
      'Nuevo apartado Caja: abres el día con tu fondo (con cuánto empiezas el cajón) y al cerrar cuentas el efectivo. La app suma sola las ventas en efectivo del día y te dice cuánto debería haber, cuánto contaste y si falta o sobra dinero. Queda el registro de cada corte.',
    donde: 'Panel → Caja',
  },
  {
    fecha: '2026-07-25',
    tipo: 'nuevo',
    titulo: 'Cambio en pagos en efectivo',
    detalle:
      'Al cobrar en efectivo puedes poner con cuánto paga el cliente (botones de $50, $100, $200, $500 o "Justo") y la app calcula solo el cambio a devolver. Queda de registro en el pedido y sale impreso en el ticket (Recibido y Cambio).',
    donde: 'Punto de venta',
  },
  {
    fecha: '2026-07-24',
    tipo: 'nuevo',
    titulo: 'Ver pedidos de varios días',
    detalle:
      'En Pedidos ya puedes elegir un rango "del … al …" en vez de un solo día, con atajos de Hoy, Ayer, Últimos 7 días y Este mes. Cuando el rango abarca varios días, cada pedido muestra su fecha y arriba sale el total del periodo.',
    donde: 'Pedidos',
  },
  {
    fecha: '2026-07-23',
    tipo: 'nuevo',
    titulo: 'Aviso cuando el cliente cancela',
    detalle:
      'Si un cliente cancela su pedido desde la app, ahora llega un aviso a Telegram (útil porque el pedido pudo entrar hace segundos), el pedido se marca como Cancelado en el panel y lo que se había apartado del inventario se devuelve solo.',
    donde: 'Telegram y Pedidos',
  },
  {
    fecha: '2026-07-23',
    tipo: 'arreglo',
    titulo: 'El logo al instalar la app',
    detalle:
      'Al instalar la app en el celular salía el triángulo de Vercel en vez del logo de Moramango. Ya aparece el logo correcto en Android y iPhone. Si ya la tenías instalada, desinstálala y vuelve a instalarla para que tome el ícono nuevo.',
    donde: 'Instalar aplicación',
  },
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
