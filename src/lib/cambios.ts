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
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Anotar el dinero que sale y entra de la caja',
    detalle:
      'En Caja hay un apartado nuevo para el efectivo que se mueve sin ser venta: sacaste $200 para comprar limones, metiste cambio de tu bolsa, le pagaste a un proveedor. Se anota el monto y para qué fue, y el corte lo descuenta (o lo suma) de lo que debería haber en el cajón — antes ese dinero aparecía como faltante. También, al registrar una compra en Insumos hay una casilla de "lo pagué con dinero de la caja" que anota la salida sola. Y el corte que te llega por Telegram ya trae el desglose de esas entradas y salidas.',
    donde: 'Caja · Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Ya se puede guardar un conteo (incluido el 0)',
    detalle:
      'Al contar un insumo salía "ninguna cantidad era válida" y no guardaba nada. No era por el cero: el guardado buscaba el insumo por un identificador equivocado, así que fallaba con cualquier cantidad. Ya quedó, y de paso se corrigió la fecha del conteo, que se guardaba en un formato que Google convertía en un número y se habría visto como "46252" en la tarjeta.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'mejora',
    titulo: 'Borrar la cantidad y poner otra, más fácil',
    detalle:
      'Al contar un insumo ahora dice claro que el número que escribas REEMPLAZA al que había, y trae tres atajos: "Se acabó (0)" para cuando ya no queda nada, "Está bien como dice" si el sistema tenía razón, y "🧹 Borrar y empezar de nuevo" para limpiar el campo sin ir borrando dígito por dígito. En el conteo de todo el local, cada renglón tiene un botón chico que pone 0 si está vacío o borra lo que escribiste, y arriba hay uno para borrar todo lo capturado si te equivocaste de columna.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'mejora',
    titulo: 'Contar lo que había y sumar lo que llegó, en un solo paso',
    detalle:
      'Al registrar una compra ahora aparece primero "¿Cuánto tenías antes de esta compra?". Lo dejas en blanco si el sistema ya tiene bien el número, o lo corriges si al guardar la mercancía ves que era otra cantidad. La ventana te hace la cuenta completa: "500 que ya tenías + 3000 que llegaron = 3500 g". Si corriges, queda anotado como conteo del día para que después se sepa de dónde salió. También se arregló algo que engañaba: una compra sin precio NO se guardaba en "Lo que he comprado"; ahora se guarda siempre, con precio o sin él.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Los combos se arman con productos, no con ingredientes',
    detalle:
      'En Recetario, al abrir un combo ahora puedes elegir entre "un ingrediente" o "un producto del menú". Para el Combo 1 dices que lleva un sándwich y un jugo, y el costo se saca solo sumando lo que cuesta cada uno — con eso te aparece el % de ganancia sobre tu precio. Antes había que recapturar los ingredientes del sándwich Y los del jugo dentro del combo, y si cambiabas la receta del sándwich el combo se quedaba con el costo viejo. Otra cosa importante: al vender un combo ahora sí se descuenta el inventario de todo lo que lleva.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-08-18',
    tipo: 'mejora',
    titulo: 'Registrar compras y conteos ahora se explica solo',
    detalle:
      'Contar abría una cajita gris del navegador, sin unidades ni contexto. Ahora las dos son ventanas que te dicen lo que va a pasar mientras escribes. Al registrar una compra ves la conversión completa: "5 kg son 5000 g", "tu inventario pasa de 2400 a 7400 g" y "te sale a $56 por kg, subió 12% contra la vez pasada" — así te enteras si te subieron el precio en el momento, no al cerrar el mes. Al contar te dice si sobran o faltan y por qué puede ser (merma, algo que se tiró, una compra sin capturar), y te aclara que tu inventario queda en lo que contaste.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Insumos ya se ve completo, sin nada cortado',
    detalle:
      'La pantalla era una tabla de 8 columnas: en tablet o celular los botones de "Compré" y "Conté" se salían de la orilla y no se alcanzaban. Ahora cada insumo es una tarjeta que se reacomoda sola: una por renglón en celular, dos en tablet y tres en pantalla grande. Lo mismo en la pestaña de Catálogo. Comprobado en las tres anchuras: ningún botón queda fuera y no hay que deslizar a los lados.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'nuevo',
    titulo: 'Pedido adelantado con hora de recolección',
    detalle:
      'El cliente ya puede elegir a qué hora pasa por su pedido, en bloques de 15 minutos dentro de tu horario. Sirve para descargar la mañana: el 58% de tus ventas caen entre 7 y 10, y así los preparas con tiempo en vez de tener a todos esperando parados. Si no elige nada, queda "lo antes posible" como siempre. La hora te sale en el aviso de Telegram y en la lista de Pedidos con un ⏰, para saber cuál preparar primero.',
    donde: 'Tienda · Pedidos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'nuevo',
    titulo: 'Avisarle al cliente que ya está listo',
    detalle:
      'Al poner un pedido en "Listo para recoger", aparece un botón de WhatsApp con el mensaje ya escrito para avisarle. Si eligió hora, se la recuerda. Es el aviso que más le importa al cliente y el que te evita que se quede esperando parado o que llegue antes de tiempo.',
    donde: 'Pedidos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'nuevo',
    titulo: 'Corte del día automático por Telegram',
    detalle:
      'Cada noche a las 9 te llega un solo mensaje con todo: cuánto vendiste, cómo te pagaron (para cuadrar la caja), cuánto se llevó la terminal, qué cobros quedaron sin confirmar, cuántos pedidos no se entregaron y qué insumo se acabó. Antes esa información estaba repartida en cuatro pantallas. También hay un botón en Métricas para pedirlo cuando quieras. Si un día no hubo ventas, no se manda nada.',
    donde: 'Métricas',
  },
  {
    fecha: '2026-08-17',
    tipo: 'mejora',
    titulo: 'Insumos más fácil de usar',
    detalle:
      'Cada insumo tenía seis botones y tres de ellos cambiaban el mismo número de formas distintas (Conteo solo anotaba, Stock lo cambiaba y Ajustar igualaba uno con otro): había que saber cuál usar. Ahora quedan dos: "🛒 Compré" y "✍️ Conté". Al contar, se anota el conteo con su fecha y el stock queda en lo que contaste, en un solo paso. Lo demás pasó a letra chica: "En qué se usa" y "Ya no lo uso". Los títulos de las columnas también cambiaron a palabras normales: "Cuánto queda", "Se gasta al día", "Última compra", "Cómo está".',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'mejora',
    titulo: 'Insumos: contar el local y ver lo comprado',
    detalle:
      'Dos cosas nuevas. Un botón "✍️ Contar el local": te lista todos tus insumos, anotas cuánto tienes de cada uno y se guarda todo junto — mientras escribes te va diciendo si sobra o falta contra lo que el sistema creía. Antes había que abrir insumo por insumo. Y una pestaña "🧾 Lo que he comprado" con todas tus compras juntas, de la más reciente a la más vieja, con cuánto llevas gastado; antes solo se veían una por una dentro de cada insumo. Las pestañas se renombraron a "Lo que hay hoy", "Lo que he comprado" y "Catálogo".',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'arreglo',
    titulo: 'Un litro ya descuenta el doble de insumo',
    detalle:
      'Al vender un jugo de 1 litro, el inventario descontaba la misma fruta que uno de 500 ml. Como casi ninguna receta estaba ligada todavía no se notaba, pero conforme las vayas vinculando el stock se iría desviando sin explicación. Ahora el tamaño se guarda con cada venta y descuenta lo que le toca: el litro cuenta como dos porciones de la receta. Si algún día usas tamaños con nombres que no dicen medida (como "Chico" y "Grande"), descuenta una porción y no se inventa proporciones.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'nuevo',
    titulo: 'Avisos de cliente nuevo y de pago confirmado',
    detalle:
      'Te llega un mensaje a Telegram cuando alguien se registra —por la app o dado de alta en el mostrador— y cuando se confirma un cobro que estaba pendiente. Para avisarle al CLIENTE hay dos botones de WhatsApp: uno en Pedidos, "Avisarle que ya recibimos su pago", y otro en Usuarios para mandarle la bienvenida. Van a mano a propósito: la app no puede mandar notificaciones al celular del cliente, sobre todo en iPhone, así que el botón deja el mensaje escrito y tú solo le das enviar.',
    donde: 'Pedidos · Usuarios',
  },
  {
    fecha: '2026-08-17',
    tipo: 'nuevo',
    titulo: 'Las transferencias ya no se te pierden',
    detalle:
      'Al cobrar con transferencia en el mostrador aparece una casilla: "Ya vi la transferencia en mi cuenta". Si no la marcas, esa venta queda como cobro por confirmar y te sale un aviso arriba en Pedidos, con cuántos son y cuánto suman, hasta que la des por recibida. Antes ese dinero no quedaba en ningún radar. También hay filtro por forma de cobro en Pedidos (efectivo, terminal, transferencia, pago en línea o sin registrar), y al abrir un pedido se aclara que el método se puede corregir ahí mismo sin cancelar la venta.',
    donde: 'Venta · Pedidos',
  },
  {
    fecha: '2026-08-17',
    tipo: 'arreglo',
    titulo: 'Los combos ya respetan lo que se acabó',
    detalle:
      'Si un jugo o licuado se marca agotado, los combos que lo ofrecen dejan de darlo a elegir: al cliente le sale tachado con "hoy no hay" y no lo puede escoger. Si un combo se queda sin ninguna opción posible (por ejemplo, sin una sola bebida), el combo entero se sale del menú en vez de dejar que lo abran y descubran que no pueden elegir nada. En el mostrador la opción se te marca en rojo como "agotado", pero SÍ te deja usarla: tú sabes si de verdad queda. La liga es por el nombre, así que el producto dentro del combo debe llamarse igual que en el menú.',
    donde: 'Tienda · Venta',
  },
  {
    fecha: '2026-08-17',
    tipo: 'arreglo',
    titulo: 'El pago con tarjeta ya queda registrado desde el principio',
    detalle:
      'Cuando alguien pedía con tarjeta, la app no anotaba nada hasta que Mercado Pago confirmara. Si esa confirmación no llegaba, el pedido se quedaba "sin registrar" para siempre — tienes 4 pedidos así, $220 sin poder saber cómo te pagaron. Ahora la forma de pago se anota al momento de hacer el pedido. Además, si el cobro con tarjeta no se puede abrir, al cliente se le avisa en vez de dejarlo creer que ya pagó. En Pedidos aparece un enlace "Ver en Mercado Pago" para llegar directo a ese cobro, y un botón para copiar el enlace de pago y reenviárselo a quien lo dejó a medias.',
    donde: 'Pedidos · Tienda',
  },
  {
    fecha: '2026-08-17',
    tipo: 'arreglo',
    titulo: 'Un pedido cancelado ya no cuenta para el premio',
    detalle:
      'Al cancelar un pedido, la compra le seguía contando al cliente para su 15% y su artículo gratis. Se podía pedir y cancelar cinco veces y ganarse el descuento sin comprar nada. Ahora al cancelar se le descuenta ese avance, y si ese pedido fue justo el que le dio el premio, el premio se retira. Si el pedido cancelado iba a usar un premio suyo, se le devuelve para que no lo pierda. También se corrigieron los 13 cancelados que ya existían: se ajustó el avance de 8 clientes, pero los premios que ya tenían se les respetaron.',
    donde: 'Pedidos · Usuarios',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Métricas: cuánto te cobra la terminal',
    detalle:
      'Nuevo apartado en Métricas con tres cifras: venta total cobrada con terminal, comisión cobrada y total menos comisión. Abajo también sale cuánto te queda del periodo completo ya descontada. La cuenta es 3.49% + $4 + IVA, y se calcula venta por venta porque los $4 son por cada cobro: en tus ventas de terminal registradas, $1,395 dejan $1,255 — se van $140 en comisión. Ojo con los tickets chicos: un cobro de $20 paga $5.45, más de la cuarta parte.',
    donde: 'Métricas',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'El registro del local se une solo con la cuenta de la app',
    detalle:
      'Si alguien ya compraba en el local y luego se baja la app, al capturar su teléfono se le juntan las dos: sus compras anteriores aparecen en su cuenta y su avance para el premio sigue donde iba, sin empezar de cero. Se lo avisamos en pantalla para que no le salgan pedidos de la nada. Si el número resulta estar en la cuenta de Google de otra persona, ahí sí se rechaza como antes.',
    donde: 'Tienda · Usuarios',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'La dirección del local en la app',
    detalle:
      'En Ajustes puedes capturar la dirección y, opcionalmente, el enlace de Google Maps. Se le muestra al cliente al final del menú (sin necesidad de iniciar sesión), al elegir pagar al recoger y en la pantalla de su pedido confirmado, con un botón de “Cómo llegar”. Está vacía: hay que capturarla para que se vea.',
    donde: 'Ajustes · Tienda',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Buscador y edición en Usuarios',
    detalle:
      'Arriba de la lista hay un buscador: escribes nombre, teléfono o correo y filtra al momento. El teléfono lo encuentra aunque lo teclees distinto a como está guardado (con lada, con espacios o solo los últimos dígitos). Y cada usuario tiene un botón de Editar para corregirle el nombre, el teléfono y dejarle una nota privada. El correo no se puede cambiar porque es su cuenta de Google: cambiarlo lo dejaría sin poder entrar. Si le pones un teléfono que ya es de otra cuenta, te avisa de quién es y no lo guarda.',
    donde: 'Usuarios',
  },
  {
    fecha: '2026-08-03',
    tipo: 'mejora',
    titulo: 'Las opciones se recogen al contestarlas',
    detalle:
      'En el Combo 1 se veían al mismo tiempo los 2 quesos, las 8 bebidas y el tostado: no cabía en la pantalla. Ahora, en cuanto el cliente contesta una, esa lista se recoge en un renglón que dice lo que eligió, con un botón de "Cambiar" por si se arrepiente. Igual en el mostrador. De paso, ya no viene nada preseleccionado: antes el sabor salía elegido de fábrica y alguien podía agregar sin fijarse y llevarse el que no era. El botón dice qué falta por elegir y no deja continuar hasta contestar todo.',
    donde: 'Tienda · Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Reacomodar los productos con flechas',
    detalle:
      'En Productos ahora los ves agrupados (Combos, Comida salada, Jugos…) y en cada uno hay flechas para subir y bajar. El acomodo que dejes se ve igual en la tienda y en Venta, así que ya no hay que buscar los productos revueltos al cobrar. Para pasar algo a otro grupo, edítalo y cámbiale la categoría. Y un producto nuevo ya entra al final de SU grupo, no hasta el final de todo: ese era el problema de antes.',
    donde: 'Productos · Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Toppings extra con costo',
    detalle:
      'Ahora puedes ofrecer agregados que suben el precio: chía, granola, lo que vendas. En Productos → editar → Toppings extra pones cuáles son y cuánto cuesta cada uno. El cliente marca los que quiera (o ninguno) y el precio se actualiza al momento; en el mostrador te aparecen igual. Se cobran por pieza y salen en el ticket: "Licuado de Fresa (1 litro · + Proteína)". Ningún producto tiene toppings todavía: se los pones tú a los que quieras.',
    donde: 'Productos · Tienda · Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Descuento manual en el mostrador',
    detalle:
      'En Venta hay un apartado para descontar un monto por algo fuera de lo normal: se tardó el pedido, un acuerdo con un cliente, lo que sea. Pide el motivo a fuerza, para que en el corte se pueda saber por qué esa venta cobró de menos, y no deja descontar más de lo que cuesta la venta. Si el cliente además traía descuento de lealtad, los dos se suman.',
    donde: 'Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'arreglo',
    titulo: 'Ya se alcanza el botón de Guardar en Productos',
    detalle:
      'Al editar un producto con muchas opciones, como el Combo 1, el formulario crecía más que la pantalla y no había manera de bajar hasta Guardar. Ahora los campos tienen su propio deslizamiento y los botones de Guardar y Cancelar se quedan fijos abajo, siempre a la vista, sin importar cuántas opciones tenga.',
    donde: 'Productos',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Puedes dar de alta combos nuevos tú sola',
    detalle:
      'Al crear un producto ya aparecen las mismas secciones que al editarlo: tamaños con precio propio, opciones a elegir y existencias. Para un combo nuevo, eliges la categoría "Combos" y le agregas sus preguntas (queso, bebida, lo que necesites) antes de guardar. Lo único que se agrega después es la foto, porque el producto tiene que existir primero.',
    donde: 'Productos',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Los combos ya se arman a gusto del cliente',
    detalle:
      'El Combo 1 pregunta el queso (suizo o panela) y la bebida entre los 4 jugos y los 4 licuados. El Combo 2 pregunta el sabor del jugo. El cliente elige antes de agregarlo, y en el mostrador te aparece la misma pregunta. En el ticket sale completo: "Combo 1 (Queso panela · Jugo de Mango)", para que quien prepara no tenga que preguntar. Las opciones se editan en Productos → editar → Opciones a elegir, y ahí puedes agregar sabores nuevos o usarlo en cualquier otro producto.',
    donde: 'Productos · Tienda · Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'nuevo',
    titulo: 'Jugos y licuados en 500 ml y 1 litro',
    detalle:
      'Los 8 jugos y licuados ya se venden en dos tamaños con precio propio. El cliente elige el tamaño al tocar el producto, y en el mostrador te pregunta cuál lleva antes de agregarlo. Los precios se editan en Productos → editar → Tamaños, uno por uno. Ojo: el precio de 1 litro quedó puesto al doble solo como punto de partida, revísalo. Cualquier otro producto puede venderse por tamaños igual, no solo los jugos.',
    donde: 'Productos · Tienda · Venta',
  },
  {
    fecha: '2026-08-03',
    tipo: 'arreglo',
    titulo: 'El precio ahora lo decide el sistema, no el celular',
    detalle:
      'Hasta hoy el total de un pedido se calculaba con el precio que mandaba el celular del cliente. Alguien con conocimientos podía modificarlo y pagar de menos. Ahora el precio siempre se toma de tu hoja de Productos y se ignora lo que venga del celular. Nadie lo había hecho, pero con dos precios por producto convenía cerrarlo.',
    donde: 'Tienda · Venta',
  },
  {
    fecha: '2026-08-02',
    tipo: 'mejora',
    titulo: 'El panel ya no se queda pensando',
    detalle:
      'Insumos, Biblioteca y Recetario revisaban cinco veces que las hojas y columnas del Excel existieran, una tras otra, antes de mostrar o guardar nada: 1.2 segundos de espera en cada carga y en cada guardado. Ahora se revisa una sola vez al arrancar y se recuerda por diez minutos, así que a partir de la segunda vez no cuesta nada. Si llegas a borrar una columna a mano en el Excel, en diez minutos se vuelve a revisar y se repone sola.',
    donde: 'Insumos · Recetario · Productos · Venta',
  },
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
