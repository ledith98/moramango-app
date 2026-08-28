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
    fecha: '2026-08-27',
    tipo: 'nuevo',
    titulo: 'Al cerrar el día te avisa si quedaron ventas sin entregar',
    detalle:
      'En Dinero → El cajón, antes de hacer el corte, si quedan ventas del día sin marcar como entregadas te lo dice y te pregunta: “¿Ya se entregaron todas?”. Si dices que sí, las cierra todas de un golpe. Si dices que no, te las muestra una por una para que marques las que sí. Las que no digan cómo te pagaron no se cierran a ciegas: te pregunta el método, porque cerrarlas sin eso metería un cobro de terminal al cajón y descuadraría el corte.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-27',
    tipo: 'arreglo',
    titulo: 'Los combos ya se enteran cuando se acaba un licuado',
    detalle:
      'Si se acababa el Licuado de Plátano, el Combo Croissant lo seguía ofreciendo: en el combo la opción se llama solo “Plátano” y el producto “Licuado de Plátano”, así que los nombres no empataban y nunca se apagaba. Ahora el nombre del grupo sirve de pista — grupo “Licuado” más opción “Plátano” es el Licuado de Plátano — y la opción se apaga sola. Si se acaba TODO un grupo, el combo entero sale del menú. Los que ya usaban el nombre completo, como el Combo 1 y el Combo 2, seguían funcionando bien.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-08-27',
    tipo: 'nuevo',
    titulo: 'Movimientos en Mercado Pago: todo lo que entra y sale, en un solo lugar',
    detalle:
      'En Dinero → La cuenta ahora está el estado de cuenta completo, desde tu primera venta: lo que entró por ventas ya sin comisión, más el rendimiento, MENOS todo lo que sacaste, y cuánto debe haber hoy — comparado contra lo que dice Mercado Pago. Abajo van los gastos uno por uno, con su fecha y en qué fue, para cuando el total no cuadra con lo que recuerdas haber gastado. Y plegados al final, todos los saldos que has anotado, con cuánto cambió cada vez. Antes cada captura de saldo borraba la anterior y los gastos no se veían por ningún lado, aunque sí se estuvieran restando. De paso se arregló que la fecha del saldo se veía como “46260”: Google la convertía en número al guardarla.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-27',
    tipo: 'nuevo',
    titulo: 'Tu información se respalda sola cada madrugada',
    detalle:
      'Todo tu negocio —pedidos, clientes, inventario, recetas, dinero— vivía en una sola hoja de cálculo, sin ninguna copia. Un borrado por error o perder la cuenta y no había de dónde recuperarlo. Ahora cada madrugada se guarda una copia completa de las 19 pestañas y se conservan los últimos 30 días. La ves en Ajustes, hasta abajo, y desde ahí puedes descargar cualquier día o hacer una copia al momento. Se guarda fuera de Google a propósito: si el problema fuera Google, un respaldo dentro de Google no serviría de nada.',
    donde: 'Ajustes',
  },
  {
    fecha: '2026-08-27',
    tipo: 'arreglo',
    titulo: 'Ya no se puede entregar un pedido sin decir cómo se pagó',
    detalle:
      'Los pedidos que se hacen por la app para pagar al recoger nacen sin método de pago, porque el cliente todavía no ha pagado. Si nadie lo anotaba al entregar, ahí se quedaba vacío — y la app lo contaba como efectivo, así que un cobro por terminal terminaba sumando al cajón y el corte del día dejaba de cuadrar sin que nadie se enterara. Ya pasó con cuatro pedidos. Ahora, al marcar Entregado un pedido sin método, la app pregunta cómo te pagaron y no deja seguir hasta que se responda. Es el momento correcto para preguntarlo: es cuando estás cobrando.',
    donde: 'Pedidos',
  },
  {
    fecha: '2026-08-27',
    tipo: 'nuevo',
    titulo: 'La cuenta te dice si empata con Mercado Pago, y cierra la diferencia sola',
    detalle:
      'En Dinero → La cuenta, debajo de “Lo que rinde tu dinero”, anotas el saldo que ves en Mercado Pago y la app te dice al momento si cuadra. Si sobra dinero en Mercado Pago casi siempre es el rendimiento que el banco te pagó de madrugada y que la app no tiene forma de adivinar, así que sale un botón para anotarlo de un toque y quedan iguales. Si falta, te avisa que puede ser una transferencia que registraste y nunca llegó, o una salida sin anotar. La comparación se hace contra TODO lo acumulado desde tu primera venta, no contra el periodo que tengas elegido — el saldo del banco viene desde el día uno, y compararlo contra un mes daría una diferencia falsa cada vez.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Tarjeta de lealtad en Google Wallet, con sellos que se van llenando',
    detalle:
      'Tus clientes con Android ya pueden guardar su tarjeta de lealtad en Google Wallet, desde su perfil en la tienda. Se ven los 10 sellos: los que ya juntó en café, el 5 y el 10 en dorado porque ahí están los premios (15% y artículo gratis). Trae su QR para que en el mostrador lo escanees en vez de buscarlo por nombre. Lo mejor: cuando registras su venta, los sellos se llenan solos en su teléfono sin que abra nada, y Google le puede avisar en la pantalla de bloqueo cuando junta su premio. Si cancelas un pedido, también baja. Por ahora funciona con las cuentas que registres como prueba; para todos los clientes falta que Google apruebe el Perfil de Negocio.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'La pantalla de pagar ya no se come media pantalla',
    detalle:
      'El panel de abajo en "Tu Pedido" ocupaba casi la mitad del celular, y con Transferencia seleccionada el 61% — el cliente tenía que hacer malabares para ver su propio pedido. Ahora ocupa entre 23% y 28%. Se quitaron de ahí dos cosas que no hacían falta todavía: la dirección del local y el bloque de la CLABE. Las dos ya salen después de confirmar, y ahí salen mejor: la dirección con su botón de Cómo llegar, y la CLABE junto con el número de pedido para el concepto (que en la pantalla de pagar ni existe, porque el pedido todavía no se ha creado) y el botón de mandar el comprobante por WhatsApp. Nadie transfiere ni va camino al local antes de confirmar.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-08-20',
    tipo: 'arreglo',
    titulo: 'La comparativa de proveedores estaba dejando fuera casi todo',
    detalle:
      'Comparar precios solo miraba las compras registradas, así que los precios que ibas anotando por proveedor —68 de ellos— nunca llegaban a la comparación. Te mostraba UN insumo comparable cuando había OCHO: plátano, naranja, jalapeño, fresa, papaya, aguacate, tomate y piña. Y es justo al revés de como se usa: vas, preguntas en dos lados y quieres ver cuál conviene antes de comprar. Ya cuentan los dos, y cada renglón dice de dónde salió el precio — “3 compras” o “precio que anotaste, sin comprarle todavía”. Si de un proveedor tienes las dos cosas, gana la más reciente.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Historial de precios: cómo se ha movido y borrar los mal anotados',
    detalle:
      'En Proveedores, toca el precio de cualquier insumo y se abre su historial completo: cada precio con su fecha, si lo compraste, lo anotaste o solo confirmaste que seguía igual, quién lo capturó, y cuánto subió o bajó respecto al anterior. Antes solo se guardaba el último precio — al anotar uno nuevo, el anterior se perdía — así que no había forma de saber si algo subió ni de deshacer una captura mala. Los que tú anotaste se pueden borrar con “Lo anoté mal, bórralo”, y al borrarlos el precio que vale pasa a ser el anterior de la lista automáticamente. Los que vienen de una compra no se borran ahí: esos también movieron el stock y lo gastado, así que se corrigen en Insumos → Lo que he comprado, y la pantalla te lo dice.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'En Proveedores, primero lo que vas a pagar',
    detalle:
      'En el directorio, cada insumo muestra arriba y en grande lo que cuesta el paquete completo —lo que de verdad sacas de la cartera si vas con ese proveedor— y abajo, en chiquito, a cómo sale la pieza. Antes era al revés. En la pestaña Comparar se queda como estaba, con el precio por pieza mandando: ahí la pregunta es cuál conviene, y para eso lo único comparable es el precio por pieza (un paquete de 40 tenedores a $12 sale más barato que uno de 25 a $8).',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Cada precio dice de cuándo es, y se confirma de un toque',
    detalle:
      'En Proveedores, junto a cada insumo ahora sale de cuándo es el precio: “precio de hace 5 días” en verde, “hace 3 meses” en ámbar, “hace 6 meses” en rojo. Sirve sobre todo en Comparar: puede pasar que el marcado como más barato lo esté según un precio de hace medio año, mientras el otro es de esta semana — eso no es una comparación, y ahora se ve. En los que ya tienen tiempo aparece un botón “sigue igual”: si fuiste, preguntaste y cuesta lo mismo, lo picas y la fecha se pone al día sin cambiar el precio. Sin eso, un precio estable se vería cada vez más viejo aunque lo confirmes cada semana. Y al anotar un insumo se pregunta cuándo viste ese precio, por si lo viste el sábado y lo capturas el lunes.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'La foto del producto ahora se ve casi 4 veces más grande',
    detalle:
      'Al abrir un producto en la tienda, la foto vivía en un recuadro bajito con aire gris a los lados: una foto vertical se encogía hasta caber ahí y acababa ocupando como un tercio del espacio. Ahora va de lado a lado y mide casi el doble de alto — en promedio la foto se ve 3.7 veces más grande, y en varios productos 4 veces. Ninguna foto se recorta, porque varias son carteles con texto y les cortaría el precio; en su lugar, el espacio que sobra se rellena con una copia borrosa de la misma foto, así se ve llena y no vacía.',
    donde: 'Tienda',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'Las fotos ya se pueden subir desde el celular sin batallar',
    detalle:
      'Antes, una foto tomada con el teléfono pesaba más de lo que la app aceptaba y te la rechazaba pidiéndote que la “recortaras”, sin decirte cómo. Ahora la app la achica sola antes de subirla: una foto de 1.7 MB queda en 172 KB y se sigue viendo nítida. Te dice cuánto bajó. Esto también hace que la tienda cargue mucho más rápido para el cliente que la abre con datos, porque antes se le mandaba la foto entera. Y si una foto deja de cargar por lo que sea, en la tienda vuelve a salir el emoji del producto en vez del cuadrito roto.',
    donde: 'Productos',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Traer las fotos de Google Drive a la app',
    detalle:
      'Tus 30 fotos viven hoy en Google Drive. Funcionan, pero no son tuyas: si a esos archivos les cambian el permiso, se mueven de carpeta o Google limita cuántas veces se muestran desde fuera, la tienda se queda sin fotos y nadie se entera hasta que un cliente lo ve. En Productos sale un aviso con un botón que las trae todas de un jalón, sin que tengas que volver a subirlas una por una. Si alguna no se puede traer te dice cuál y por qué — casi siempre es que el archivo no está compartido como “cualquier persona con el enlace”. Aparece solo cuando el almacén de imágenes está activo.',
    donde: 'Productos',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'La caja se abre sola con la primera venta y se cierra a las 7',
    detalle:
      'Ya no hay que acordarse de abrir la caja antes del primer cliente: la primera venta del día la abre sola, con el fondo que dejaste la última vez. Como ese fondo lo puso la app y no tú, arriba te avisa y te deja corregirlo con un toque — si ese día dejaste otra cantidad y no se corrige, el corte marcaría un faltante que no existe. A las 7 de la noche la caja se cierra sola y te llega el corte del día a Telegram. Ojo con esto: el cierre automático NO cuenta el efectivo, lo deja en blanco a propósito. Si pusiera ahí lo que debería haber, todos los días cuadrarían perfecto y el corte dejaría de servir para lo único que sirve, que es ver cuándo falta dinero. Si alcanzas a contar el cajón, anótalo y ya; si no, el día queda cerrado igual.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'Borrar una presentación que anotaste por error',
    detalle:
      'En Insumos, al abrir una presentación para editarla, abajo aparece “La anoté por error, bórrala”. Solo funciona si nunca le has registrado una compra: si ya se la compraste, borrarla dejaría esas compras apuntando a la nada y perderías su historial de precios, que es justo con lo que se comparan los proveedores. Para esas está “ya no la compro así”, que la esconde sin borrar nada.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-20',
    tipo: 'arreglo',
    titulo: 'Ya se puede guardar al editar un insumo en Proveedores',
    detalle:
      'Al corregir un insumo desde Proveedores, si algo fallaba el botón se quedaba en “Guardando…” para siempre y no decía qué había pasado. Ya avisa con un mensaje y te deja reintentar. También encontré cinco insumos cuyo precio se había guardado como FECHA — Google leía “4.03” como “4 de marzo” — y los corregí: papaya, tapa 414, vaso 116, domo y sandwichero. Ya no puede volver a pasar.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'La marca se ve en Insumos, y los precios traen su fecha',
    detalle:
      'En Insumos, cada uno muestra su marca junto al nombre — “Mayonesa · Hellmann’s”, o “Hellmann’s y 1 más” si le compras de varias. Y cada precio dice de cuándo es: un precio sin fecha no se puede leer, no sabes si es de esta semana o de hace medio año. Se fecha con el día de la compra, no el de captura.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Dar de alta un insumo nuevo desde Proveedores',
    detalle:
      'En “+ Insumo”, si lo que venden no está en tu catálogo eliges “➕ No está en la lista” y lo das de alta ahí mismo, con su nombre y en qué lo piden las recetas. Nace guardado y sin usarse: queda listo para cuando lo ocupes en una receta, sin ensuciar el conteo diario. Sirve para apuntar algo que viste en la bodega antes de olvidarlo.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'Los insumos anotados en un proveedor ya se pueden corregir y borrar',
    detalle:
      'Una vez anotado qué vende un proveedor, no había forma de arreglarlo si te equivocabas. Ahora tócalo y se abre para corregir la marca, cómo viene, cuánto trae y el precio. Hay dos formas de quitarlo, y no son lo mismo: “ya no la compro así” lo esconde pero conserva su historial de precios, y “lo anoté por error” lo borra de verdad — esto último solo si todavía no le has comprado, porque si no esas compras se quedarían sin a qué apuntar.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Cada proveedor con su ubicación, y botón para abrir Google Maps',
    detalle:
      'En Proveedores puedes anotar dónde está cada uno: escribes la dirección o pegas el enlace que comparte Google Maps — las dos sirven. En la tarjeta aparece un botón 📍 que abre Maps: si pegaste el enlace lo abre en el punto exacto, y si escribiste la dirección la busca. Mientras capturas hay un “Probar en Maps” para comprobar que lleva a donde debe antes de guardar.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'Los movimientos de dinero se ven por periodo, no todos revueltos',
    detalle:
      'En Dinero, la lista de entradas y salidas mostraba todo lo del mes aunque estuvieras cortando el cajón de hoy. Ahora en el cajón ves los de hoy — con su “Sacaste $450 hoy” — y en la cuenta los del periodo que elijas. El botón “Ver todos” sigue ahí para cuando busques algo viejo.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Anotar qué vende un proveedor, aunque todavía no le compres',
    detalle:
      'En Proveedores, cada tarjeta trae “+ Insumo”: eliges el insumo, la marca, cómo viene, cuánto trae y en cuánto lo tienen. Queda anotado con la etiqueta “aún sin comprar” y ya cuenta para comparar precios — que es cuando más sirve, para saber a dónde ir antes de salir.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Un insumo puede comprarse en varias presentaciones y marcas',
    detalle:
      'La Mayonesa estaba registrada como “paquete de 2 kg”, y si no había y comprabas un bote de 1.8 kg de otra marca, esa compra no cabía. Ahora cada insumo tiene sus PRESENTACIONES: marca, cómo viene, cuánto trae y en cuánto sale. Al comprar eliges cuál fue — o agregas una nueva ahí mismo — y la app saca el precio por gramo de cada una y te marca con ✅ la más barata. El stock y las recetas no se parten: la mayonesa sigue siendo una sola bolsa de gramos. Los que sí son cosas distintas, como el vaso de 16 oz y el de 2 oz, siguen separados.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'El proveedor se elige de una lista, y “Ver compras” ya dice con quién compraste',
    detalle:
      'Al registrar una compra ya no escribes el nombre del proveedor: lo eliges de la lista, y si es uno nuevo lo agregas ahí mismo y queda dado de alta en el directorio. Así no vuelven a salir tres versiones del mismo lugar. En “Ver compras” de cada insumo ahora aparece con quién se compró, de qué tamaño era el paquete, a cómo salió la pieza y quién lo registró. Y en Proveedores hay botón de Ocultar en cada tarjeta, con filtro para ver los activos, los ocultos o todos.',
    donde: 'Insumos y Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Comparar precios entre proveedores aunque el paquete sea de otro tamaño',
    detalle:
      'Un paquete de 40 tenedores a $12 y uno de 25 a $8 no se pueden comparar como $12 contra $8 — el de $8 parece más barato y sale más caro. Ahora todo se compara por PIEZA: $0.30 contra $0.32. Al registrar la compra puedes decir cuánto trae el paquete de ESE proveedor sin ir a cambiar el insumo, y al momento te dice a cómo te sale la pieza. El aviso de si subió o bajó también mide por pieza. Y al contar el inventario puedes contar por paquetes: “6 paquetes de 40 y 12 sueltos” y la app saca los 252.',
    donde: 'Insumos y Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'nuevo',
    titulo: 'Directorio de proveedores, con comparación de precios',
    detalle:
      'Nueva sección 🏪 Proveedores. Guarda a quién le compras con su teléfono, con quién tratas y tus notas, y te muestra qué le compras a cada uno y cuánto llevas gastado — eso sale solo de tus compras, no hay que capturarlo. La pestaña de comparar pone el precio del mismo insumo lado a lado y te dice cuánto te ahorras yendo con el más barato. Se sembró con los 15 proveedores que ya tenías escritos y se ligaron tus compras. De aquí en adelante, al anotar dónde compraste, el nombre se guarda en el directorio en vez de quedar como texto suelto.',
    donde: 'Proveedores',
  },
  {
    fecha: '2026-08-20',
    tipo: 'mejora',
    titulo: 'Caja y Cuenta ahora son una sola sección: 💰 Dinero',
    detalle:
      'Eran dos apartados que se parecían demasiado, y había que decidir en cuál entrar antes de saber a cuál pertenecía lo que ibas a anotar. Ahora es uno solo con dos pestañas — el cajón (que se abre y se corta cada día) y la cuenta (que es un saldo que corre) — y abajo, una sola vez, el formulario para anotar entradas y salidas: eliges si el dinero salió del cajón o de la cuenta y ya. La lista de movimientos los muestra juntos, marcados con 💵 o 🏦.',
    donde: 'Dinero',
  },
  {
    fecha: '2026-08-19',
    tipo: 'nuevo',
    titulo: 'La avena ya es un extra, y descuenta del inventario cuando la piden',
    detalle:
      'Los cuatro licuados traen ahora “Avena +$10” como extra a elegir. Antes se descontaban 20 g de avena en TODOS los licuados de plátano aunque nadie la pidiera, y en los demás no se descontaba nunca. Ahora los 20 g salen del inventario solo cuando el cliente la pide, y el costo del licuado sin avena ya no la carga. Si el licuado es de litro, se descuentan 40 g.',
    donde: 'Venta y la app del cliente',
  },
  {
    fecha: '2026-08-19',
    tipo: 'mejora',
    titulo: 'Recetas al día con el recetario del local',
    detalle:
      'Se capturó el recetario que está pegado en el local. Los licuados quedaron con sus cantidades reales (dos plátanos, 19 g de chocolate, el hielo que faltaba en el de fresa) y las de leche y agua se dejaron en 250 ml para tener holgura. El Jugo de Papáya, que no llevaba papaya, y el de Melón, que tenía los números cruzados, quedaron corregidos aunque sigan pausados. Márgenes: Plátano 76%, Mango 73%, Chocobanana 68%, Fresa 66%.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-08-19',
    tipo: 'arreglo',
    titulo: 'El aviso del pedido ya dice QUÉ eligió el cliente, no solo la respuesta',
    detalle:
      'Al llegar un pedido, el aviso decía “Mango · No” y había que adivinar si el mango era el licuado o el chile, y a qué se contestó que no. Ahora cada elección va en su propio renglón con su nombre: “Licuado: Mango”, “Tostado: No”, “+ Aguacate”, y debajo la descripción del combo. Lo mismo se ve en el carrito, en el ticket y en Mis pedidos.',
    donde: 'Avisos de Telegram y toda la app',
  },
  {
    fecha: '2026-08-19',
    tipo: 'mejora',
    titulo: '“Volver a pedir” ahora te pregunta antes, y sí puede repetir combos',
    detalle:
      'Antes el botón metía el pedido al carrito sin avisar, y con cualquier combo decía que no estaba disponible — porque no sabía recuperar qué licuado o qué queso habías elegido. Ahora se abre una ventana con el detalle exacto de lo que se va a pedir y dos botones: “Sí, quiero lo mismo” o “No, quiero cambiarle algo”, que te lleva al menú. Y los combos sí se repiten, con su sabor y todo. Además, en Mis pedidos ya se ven las notas que escribiste (“sin granola”), que antes no aparecían en ningún lado.',
    donde: 'Mis pedidos',
  },
  {
    fecha: '2026-08-19',
    tipo: 'mejora',
    titulo: 'Al registrar una compra eliges si la pagaste del cajón o de la cuenta',
    detalle:
      'La casilla de “lo pagué con dinero de la caja” ahora es una elección de tres: efectivo del cajón, dinero de la cuenta, o no lo anotes. La salida se anota sola con la fecha de la compra, en la bolsa que elijas, y así queda ligada al insumo sin capturar nada dos veces. Usa “no lo anotes” si ya habías sacado el dinero antes y lo anotaste aparte, o si lo pagaste de tu bolsa.',
    donde: 'Insumos → Compré',
  },
  {
    fecha: '2026-08-19',
    tipo: 'arreglo',
    titulo: 'Los jugos de naranja y piña no llevaban ni naranja ni piña',
    detalle:
      'El Jugo de Naranja descontaba medio kilo de pulpa de mango, y el de Piña descontaba café. Las recetas se habían copiado de otra y no se cambió el ingrediente. Ya quedaron con lo suyo: 1.5 kg de naranja y 600 g de piña por vaso de 500 ml (el litro lo calcula solo, al doble). El agua de todos los jugos pasó a ser de garrafón, 250 ml. Y el Croissant dulce bajó de 200 g de Nutella a 100: su margen sube de 12% a 43%.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-08-19',
    tipo: 'nuevo',
    titulo: 'Filtrar los pedidos por producto',
    detalle:
      'En Pedidos hay un selector de Producto: eliges Croissant dulce o Jugo de Naranja y te quedan solo los pedidos que lo llevaron, con el número grande de cuántas piezas se pidieron en total. La lista del selector se arma con lo que de verdad se vendió en el periodo, ordenada de lo más pedido a lo menos, y trae la cuenta al lado. Se combina con los demás filtros: puedes ver cuántos jugos de naranja se pagaron con terminal la semana pasada. Los combos se agrupan aunque cada quien haya elegido distinta bebida.',
    donde: 'Pedidos',
  },
  {
    fecha: '2026-08-19',
    tipo: 'arreglo',
    titulo: 'El saldo de la cuenta ya se guarda, y los movimientos distinguen cajón de banco',
    detalle:
      'En Cuenta, el campo de “¿cuánto tienes en la cuenta?” no guardaba nada: se borraba al salir. Ahora tiene su botón de Guardar y queda anotado con la fecha en que lo tomaste, para que se note cuándo el dato ya está viejo. No hace falta anotar ningún movimiento para eso. El porcentaje se recalcula mientras escribes, al instante. Y al anotar un movimiento ahora eliges si el dinero salió del cajón o de la cuenta, y anotas en qué se usó: los del cajón cuentan en el corte de Caja y los de la cuenta en el saldo, pero los dos se anotan desde el mismo lugar.',
    donde: 'Cuenta',
  },
  {
    fecha: '2026-08-19',
    tipo: 'mejora',
    titulo: 'En Pedidos ya se ve cuánto te queda de verdad de cada cobro con tarjeta',
    detalle:
      'Debajo del total de cada pedido cobrado con terminal o en línea aparece en verde lo que de verdad entra a tu cuenta, ya sin la comisión: un cobro de $115 dice “te quedan $110.33”. Arriba, junto al total del filtro, viene la suma: lo que te queda y cuánto se llevó la comisión. Al abrir el pedido lo ves desglosado. El efectivo y las transferencias no lo muestran porque llegan completos. En Venta, al elegir Terminal te lo dice ANTES de cobrar, para que decidas si te conviene pedir efectivo.',
    donde: 'Pedidos y Venta',
  },
  {
    fecha: '2026-08-19',
    tipo: 'nuevo',
    titulo: 'Nueva sección “Cuenta” para el dinero que no está en el cajón',
    detalle:
      'Ahí vive lo que te pagan con terminal, en línea y por transferencia. Te separa lo COBRADO (lo que pagó el cliente) de lo DISPONIBLE (lo que de verdad quedó en la cuenta, ya sin comisión), y la transferencia se marca como que llega completa. Puedes anotar el dinero que sacas para pagar insumos o proveedores, y el rendimiento que te paga el banco: si le escribes cuánto tienes en la cuenta, te dice a cuántos por ciento al año te está rindiendo. Se ve por mes, por semana o por el rango que elijas.',
    donde: 'Cuenta',
  },
  {
    fecha: '2026-08-19',
    tipo: 'arreglo',
    titulo: 'La comisión de la terminal estaba calculada al doble',
    detalle:
      'La app le cobraba a la terminal la misma tarifa del pago en línea (3.49% + $4 + IVA), pero la terminal NO cobra los $4 fijos: son 3.50% + IVA, o sea 4.06% parejo. Cotejado con los movimientos reales de tu cuenta del 11 al 19 de agosto, los 13 cobros cuadran al centavo. Sobre $1,150 cobrados con tarjeta la app decía $97.59 de comisión cuando la real fue $46.69. Ahora Métricas separa las dos tarifas y te dice cuánto se lleva cada una.',
    donde: 'Métricas → Lo que se queda Mercado Pago',
  },
  {
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Los combos y los productos de reventa ya tienen receta',
    detalle:
      'Los 8 combos vivos quedaron armados con los productos que ya existían: el Combo Croissant es “un croissant de jamón y queso más un licuado”, no una lista de ingredientes recapturada. Si cambias la receta del croissant, el combo se entera solo. También los de reventa (agua, refresco, conchas, galleta, bite) quedaron con su renglón: uno se compra, uno se vende. Con esto el panel ya te puede sacar el costo y la ganancia de cada combo.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Los combos armados con otros productos no se estaban tomando en cuenta',
    detalle:
      'La columna donde se guarda “de qué productos se compone este combo” nunca se creó en el archivo, así que aunque lo capturaras, la app no lo veía y el combo salía sin ingredientes. Ya queda, y se crea sola de aquí en adelante.',
    donde: 'Recetario',
  },
  {
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Filtro de fechas en “Lo que he comprado”',
    detalle:
      'La lista de compras ya se puede acotar como la de Pedidos: atajos de Hoy, Ayer, Últimos 7 días, Este mes y Todo, o el rango que quieras del día tal al día tal. El total de arriba sigue al filtro, así que ves cuánto gastaste en ese periodo y no solo el acumulado de siempre. El buscador ahora encuentra por insumo o por el lugar donde compraste, y sin importar acentos (“cafe” encuentra “Café”); el selector de arriba filtra por tipo de insumo. Si la combinación no deja nada, te lo dice y te ofrece quitar los filtros de un toque.',
    donde: 'Insumos → Lo que he comprado',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Insumos nuevos ya no se le encimaban a otro',
    detalle:
      'La clave de cada insumo se sacaba contando renglones, así que al borrar uno el contador retrocedía y el insumo nuevo se quedaba con la clave de otro que ya existía. Cuando eso pasaba, los dos se pisaban: el panel mostraba el nombre de uno con la existencia del otro. Ahora la clave se toma de la más alta que haya, más uno, y no se puede repetir.',
    donde: 'Insumos → Catálogo',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Al borrar un insumo ya no queda existencia colgada',
    detalle:
      'Cuando borrabas un insumo del catálogo, su registro de inventario seguía vivo por dentro: no lo veías en el panel, pero seguía guardando la cantidad que tenías, sin manera de contarla ni corregirla. Ahora se retira junto con el insumo. También dejé de mostrar los renglones sin nombre, que salían como tarjetas en blanco.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Al comprar, te propongo el precio de la vez pasada y anotas dónde compraste',
    detalle:
      'En 🛒 Compré, si ya le habías puesto precio a ese insumo te digo en cuánto salió la vez pasada y te saco la cuenta de lo que sería por lo que estás comprando: le das un toque a “Costó lo mismo” y se llena solo. Si te salió en otro precio lo escribes y se actualiza. Además hay un campo opcional de dónde la compraste, que viene puesto con el último lugar y te ofrece de un toque los que ya has usado; así se te arma sola la lista de dónde surtes cada cosa y la ves en “Lo que he comprado”.',
    donde: 'Insumos → Compré',
  },
  {
    fecha: '2026-08-18',
    tipo: 'arreglo',
    titulo: 'Insumos ya no se sale de la pantalla en el celular',
    detalle:
      'El título con sus botones y la fila de pestañas no cabían en una pantalla de celular y estiraban toda la página a lo ancho, así que había que correrla de lado para ver los bordes. Ahora bajan de renglón cuando no caben y no queda nada cortado.',
    donde: 'Insumos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'mejora',
    titulo: 'Al anotar una compra ahora pones la fecha en que la hiciste',
    detalle:
      'En Insumos, el botón 🛒 Compré te pide la fecha de la compra y ya no te deja guardar sin ella. Viene puesta la de hoy, y si compraste el sábado y lo anotas el lunes, le cambias la fecha y el gasto queda contado en el sábado. Así “Lo que he comprado” te dice de verdad cuánto gastaste cada día. El conteo de lo que hay en el local sigue siendo de hoy, aunque la compra sea de otro día.',
    donde: 'Insumos → Compré',
  },
  {
    fecha: '2026-08-18',
    tipo: 'mejora',
    titulo: 'En Pedidos ya se ve con qué te pagaron cada uno',
    detalle:
      'Cada pedido de la lista trae ahora su forma de cobro al lado del número: 💵 Efectivo, 💳 Terminal, 📲 Transferencia, 🛍️ Pago en línea, o "sin registrar" si le falta. Antes había que abrir uno por uno para saberlo. Junto con el filtro de Cobro que ya estaba, puedes dejar en pantalla solo los de terminal y ver de un vistazo cuáles son y cuánto suman.',
    donde: 'Pedidos',
  },
  {
    fecha: '2026-08-18',
    tipo: 'nuevo',
    titulo: 'Ventas fiadas y buscador de clientes en Pedidos',
    detalle:
      'Al cobrar en efectivo ahora eliges "✅ Ya pagó" o "🕓 Queda a deber". Si queda a deber, la venta se registra igual pero aparece como cobro por confirmar y ese dinero no cuenta para el corte de caja hasta que la marques pagada. Y en Pedidos hay un buscador: escribes el nombre del cliente, su teléfono o el número de pedido y te deja solo esos, con el total de lo filtrado. Encuentra aunque escribas sin acentos o en mayúsculas, y el teléfono aunque lo teclees distinto a como está guardado.',
    donde: 'Venta · Pedidos',
  },
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
