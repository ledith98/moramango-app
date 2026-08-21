'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { esBeneficioReactivacion as esReactivacion, montoReactivacion } from '@/lib/beneficioCliente';
import {
  TRANSFERENCIA,
  TRANSFERENCIA_HABILITADA,
  TELEFONO_NEGOCIO,
  linkWhatsApp,
  mensajeComprobante,
  mensajeLlegada,
} from '@/lib/negocio';
import { estadoDeVenta } from '@/lib/disponibilidadCliente';

// Separa un teléfono guardado tipo "+528186003207" en lada y número
const parsearTelefono = (telefonoCompleto: string): { lada: string; numero: string } => {
  if (!telefonoCompleto) return { lada: '52', numero: '' };
  // Formato con +: +528186003207 → lada 52, número 8186003207
  if (telefonoCompleto.startsWith('+')) {
    const solo = telefonoCompleto.slice(1).replace(/\D/g, '');
    // Asumimos lada de 1-3 dígitos, tomamos los últimos 10 como número si es +52
    // Para otras ladas, todo lo que no es lada
    if (solo.startsWith('52') && solo.length >= 10) {
      return { lada: '52', numero: solo.slice(2) };
    }
    // Otras ladas: primeros 2-3 dígitos como lada
    return { lada: solo.slice(0, solo.length - 10) || '52', numero: solo.slice(-10) };
  }
  // Sin +: dato viejo, asumimos mexicano
  const soloDigitos = telefonoCompleto.replace(/\D/g, '');
  return { lada: '52', numero: soloDigitos.slice(-10) };
};

import { claveLinea, precioDeTamano, precioDesde, type Tamano } from '@/lib/tamanos';
import {
  claveEleccion,
  type Eleccion,
  enumerar,
  type GrupoOpcion,
  eleccionDesdeNombre,
  resumenEleccion,
} from '@/lib/opciones';
import { claveExtras, type Extra, precioExtras, resumenExtras } from '@/lib/extras';

interface ItemCarrito {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  cantidad: number;
  /** Vacío si el producto se vende con un solo precio */
  tamano: string;
  /** Lo elegido dentro del producto: { Queso: 'Queso suizo' } */
  opciones: Eleccion;
  /** Toppings elegidos; su costo ya viene sumado en `precio` */
  extras: Extra[];
  /**
   * Identifica el renglón. Dos combos con distinto queso son dos
   * renglones, no uno con cantidad 2, aunque cuesten lo mismo.
   */
  clave: string;
}

interface DatosLealtad {
  cicloActual: number;
  beneficioDisponible: string;
  pedidosParaDescuento: number;
  pedidosParaArticulo: number;
}

interface MiPedido {
  idPedido: string;
  fecha: string;
  hora: string;
  estado: string;
  estadoPago: string;
  /** Fecha del último aviso de "ya llegué"; vacío si nunca avisó */
  avisoLlegada: string;
  total: number;
  yaOpino: boolean;
  items: { idProducto: string; nombre: string; cantidad: number; subtotal: number }[];
  /** Lo que el cliente escribio al pedir ("sin granola", "poco hielo") */
  notas?: string;
}

// Avance visual del pedido; 'Cancelado' se muestra aparte
const FLUJO_ESTADOS = ['Recibido', 'En preparación', 'Listo para recoger', 'Entregado'];

const colorEstadoCliente = (estado: string) => {
  switch (estado) {
    case 'Recibido': return 'bg-blue-100 text-blue-700';
    case 'En preparación': return 'bg-amber-100 text-amber-700';
    case 'Listo para recoger': return 'bg-green-100 text-green-700';
    case 'Entregado': return 'bg-neutral-200 text-neutral-600';
    case 'Cancelado': return 'bg-red-100 text-red-700';
    default: return 'bg-neutral-100 text-neutral-600';
  }
};

// "2026-07-14" → "14 jul 2026"
const fechaBonita = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${meses[m - 1] ?? ''} ${y}`;
};

const CARRITO_KEY = 'moramango_carrito';


/**
 * La foto del producto, con el emoji de respaldo.
 *
 * Las fotos viven fuera de la app y una dirección puede dejar de servir:
 * si al archivo le cambian el permiso o lo borran, el navegador pinta el
 * icono de imagen rota — justo en la pantalla donde el cliente decide qué
 * comprar. Cuando eso pasa se cae al emoji, que es lo que se veía antes
 * de que hubiera fotos.
 */
function FotoProducto({
  src,
  alt,
  className,
  respaldo,
  conFondo = false,
}: {
  src: string;
  alt: string;
  className: string;
  respaldo: React.ReactNode;
  /** Rellena la caja con una copia borrosa de la misma foto */
  conFondo?: boolean;
}) {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo) return <>{respaldo}</>;
  return (
    <>
      {/*
        La foto se muestra completa (nunca recortada): varias son carteles
        con texto y letras, y recortarlas se comería el precio o el nombre
        del combo. Pero mostrarla completa deja franjas grises a los lados
        cuando la foto es más alta que la caja. Esta copia borrosa las
        rellena con los colores de la misma foto, así la caja se ve llena
        sin cortarle nada a la original.
      */}
      {conFondo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-60"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setFallo(true)}
      />
    </>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const [productos, setProductos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');
  // Las categorías se salen de la pantalla; sin una pista visual nadie
  // adivina que se puede deslizar para ver el resto
  const filaCategorias = useRef<HTMLDivElement>(null);
  const [hayMasCategorias, setHayMasCategorias] = useState(false);
  // Aviso flotante cuando se intenta pedir más de lo que hay
  const [avisoStock, setAvisoStock] = useState('');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [verPerfil, setVerPerfil] = useState(false);
  const [verMisPedidos, setVerMisPedidos] = useState(false);
  const [misPedidos, setMisPedidos] = useState<MiPedido[]>([]);
  // Aviso de llegada: pedido con el panel abierto, nota y el que ya avisó
  const [avisando, setAvisando] = useState<string | null>(null);
  const [notaLlegada, setNotaLlegada] = useState('');
  const [avisoEnviado, setAvisoEnviado] = useState<string | null>(null);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);
  const [avisoRepetir, setAvisoRepetir] = useState('');
  /** Pedido que se va a repetir, esperando confirmacion */
  const [confirmarRepetir, setConfirmarRepetir] = useState<MiPedido | null>(null);
  const [accionPedido, setAccionPedido] = useState<string | null>(null);
  // Opiniones: qué pedido se está calificando y con qué notas
  const [opinando, setOpinando] = useState<string | null>(null);
  const [sabor, setSabor] = useState(0);
  const [calidad, setCalidad] = useState(0);
  const [comentario, setComentario] = useState('');
  const [opinionAnonima, setOpinionAnonima] = useState(false);
  const [enviandoOpinion, setEnviandoOpinion] = useState(false);
  const [graciasOpinion, setGraciasOpinion] = useState<string | null>(null);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [telefonoUsuario, setTelefonoUsuario] = useState('');
  const [ladaUsuario, setLadaUsuario] = useState('52');
  const [errorTelefono, setErrorTelefono] = useState('');
  const [pedidoConfirmado, setPedidoConfirmado] = useState<string | null>(null);
  const [pagoExitoso, setPagoExitoso] = useState(false);
  const [formaPago, setFormaPago] = useState<'recoger' | 'transferencia' | 'linea'>('recoger');
  const [pedidoPorTransferencia, setPedidoPorTransferencia] = useState(false);
  const [clabeCopiada, setClabeCopiada] = useState(false);
  const [conceptoCopiado, setConceptoCopiado] = useState(false);
  // Total del pedido ya confirmado (se congela porque el carrito se vacía)
  const [totalPagarConfirmado, setTotalPagarConfirmado] = useState(0);
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [avisoPago, setAvisoPago] = useState('');
  const [notas, setNotas] = useState('');
  const [lealtad, setLealtad] = useState<DatosLealtad | null>(null);
  const [cargandoLealtad, setCargandoLealtad] = useState(false);
  const [beneficioAplicado, setBeneficioAplicado] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState<any | null>(null);
  /** Tamaño elegido en la ficha del producto (vacío = no tiene tamaños) */
  const [tamanoElegido, setTamanoElegido] = useState('');
  /** Opciones elegidas en la ficha: { Queso: 'Queso suizo' } */
  const [opcionesElegidas, setOpcionesElegidas] = useState<Eleccion>({});
  /** Toppings marcados en la ficha */
  const [extrasElegidos, setExtrasElegidos] = useState<Extra[]>([]);
  /** Grupo que se está reabriendo para cambiar la respuesta */
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  /** Horario: lo calcula el servidor, no la hora del celular del cliente */
  const [tienda, setTienda] = useState<{ abierta: boolean; mensaje: string }>({
    abierta: true,
    mensaje: '',
  });
  /** Hora a la que el cliente pasará por su pedido. Vacío = lo antes posible. */
  const [horaRecoger, setHoraRecoger] = useState('');
  /** Dónde recoger. Vacío mientras no se capture en Ajustes. */
  const [local, setLocal] = useState<{ direccion: string; mapa: string }>({
    direccion: '',
    mapa: '',
  });
  const [horariosRecoleccion, setHorariosRecoleccion] = useState<
    { valor: string; etiqueta: string }[]
  >([]);

  useEffect(() => {
    fetch('/api/productos')
      .then((res) => res.json())
      .then((data) => {
        if (data.productos) setProductos(data.productos);
        if (data.tienda) setTienda(data.tienda);
        if (data.local) setLocal(data.local);
        if (data.horariosRecoleccion) setHorariosRecoleccion(data.horariosRecoleccion);
        setCargando(false);
      })
      .catch(() => setCargando(false));

    try {
      const carritoGuardado = localStorage.getItem(CARRITO_KEY);
      if (carritoGuardado) {
        // Un carrito guardado antes de que existieran tamaños y opciones no
        // trae `clave` ni `opciones`. Sin esto, sus botones de + y − dejan
        // de responder y dos renglones distintos pelean por la misma llave.
        const guardado = JSON.parse(carritoGuardado) as ItemCarrito[];
        setCarrito(
          guardado.map((i) => ({
            ...i,
            tamano: i.tamano ?? '',
            opciones: i.opciones ?? {},
            extras: i.extras ?? [],
            clave: i.clave ?? claveLinea(i.id, i.tamano, '#'),
          }))
        );
      }
    } catch {}

    setNombreUsuario(localStorage.getItem('moramango_nombre') || '');
    const telefonoGuardado = localStorage.getItem('moramango_telefono') || '';
    const { lada, numero } = parsearTelefono(telefonoGuardado);
    setLadaUsuario(lada);
    setTelefonoUsuario(numero);

    // Regreso desde el checkout de Mercado Pago
    const params = new URLSearchParams(window.location.search);
    const pago = params.get('pago');
    if (pago) {
      const pedido = params.get('pedido');
      if (pago === 'exito' && pedido) {
        setPagoExitoso(true);
        setPedidoConfirmado(pedido);
      } else if (pedido) {
        setAvisoPago(
          `El pago en línea no se completó, pero tu pedido ${pedido} quedó registrado. Puedes pagarlo al recogerlo.`
        );
      }
      // Limpiar la URL para que un refresh no repita el mensaje
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // La lealtad se necesita en el carrito (para canjear) y en el perfil
  // (para mostrarle su avance junto a su código)
  useEffect(() => {
    if (session && (verCarrito || verPerfil) && !lealtad) {
      setCargandoLealtad(true);
      fetch('/api/usuario')
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setLealtad(data);
        })
        .catch(() => {})
        .finally(() => setCargandoLealtad(false));
    }
  }, [session, verCarrito, verPerfil, lealtad]);

  // Precargar nombre/teléfono desde el sheet cuando abre Mis Datos
  // (solo si los campos locales están vacíos, para no sobreescribir cambios sin guardar)
  useEffect(() => {
    if (session && verPerfil && !nombreUsuario && !telefonoUsuario) {
      fetch('/api/usuario')
        .then((res) => res.json())
        .then((data) => {
          if (data.error) return;
          if (data.nombre) setNombreUsuario(data.nombre);
          if (data.telefono) {
            const { lada, numero } = parsearTelefono(data.telefono);
            setLadaUsuario(lada);
            setTelefonoUsuario(numero);
          }
        })
        .catch(() => {});
    }
  }, [session, verPerfil, nombreUsuario, telefonoUsuario]);

  useEffect(() => {
    if (session && carrito.length > 0) {
      const volvioDeLogin = sessionStorage.getItem('moramango_login_redirect');
      if (volvioDeLogin === 'confirmar') {
        sessionStorage.removeItem('moramango_login_redirect');
        setVerCarrito(true);
      }
    }
  }, [session, carrito]);

  useEffect(() => {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
    } catch {}
  }, [carrito]);

  const categoriasUnicas = Array.from(new Set(productos.map(p => p.categoria || 'Otros')));
  const categoriasMenu = ['Todos', ...categoriasUnicas];

  const productosPorCategoria = productos.reduce((acc, producto) => {
    const categoria = producto.categoria || 'Otros';
    if (!acc[categoria]) acc[categoria] = [];
    acc[categoria].push(producto);
    return acc;
  }, {} as Record<string, any[]>);

  useEffect(() => {
    if (!avisoStock) return;
    const t = setTimeout(() => setAvisoStock(''), 2600);
    return () => clearTimeout(t);
  }, [avisoStock]);

  /** La pista se esconde al llegar al final, para no estorbar. */
  const revisarCategorias = useCallback(() => {
    const el = filaCategorias.current;
    if (!el) return;
    const restante = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setHayMasCategorias(restante > 8);
  }, []);

  useEffect(() => {
    const el = filaCategorias.current;
    revisarCategorias();
    // Listener nativo en vez de la prop onScroll: 'scroll' no burbujea y
    // así el cálculo no depende de cómo React lo enganche
    el?.addEventListener('scroll', revisarCategorias, { passive: true });
    window.addEventListener('resize', revisarCategorias);
    return () => {
      el?.removeEventListener('scroll', revisarCategorias);
      window.removeEventListener('resize', revisarCategorias);
    };
  }, [revisarCategorias, productos]);

  const getIcono = (cat: string) => {
    const c = cat.toLowerCase();
    // Mango en Jugos: comunica que son naturales, no de polvo ni de lata
    if (c.includes('jugo')) return '🥭';
    if (c.includes('licuado')) return '🥛';
    if (c.includes('bebida') || c.includes('café') || c.includes('cafe')) return '🥤';
    if (c.includes('salada') || c.includes('sándwich')) return '🥪';
    if (c.includes('dulce') || c.includes('postre')) return '🥐';
    return '🍽️';
  };

  /**
   * Icono de un producto sin foto: el emoji que se le puso en el panel y,
   * si no tiene, el genérico de su categoría.
   */
  /** Dónde está el local. No se pinta nada si todavía no se ha capturado. */
  const BloqueDireccion = ({ titulo }: { titulo: string }) =>
    !local.direccion ? null : (
      <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-neutral-800 mb-1">📍 {titulo}</p>
        <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-line">
          {local.direccion}
        </p>
        {local.mapa && (
          <a
            href={local.mapa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs font-bold text-white bg-marron px-3 py-2 rounded-lg active:scale-95"
          >
            Cómo llegar
          </a>
        )}
      </div>
    );

  const iconoProducto = (p: { emoji?: string; categoria?: string }) =>
    (p.emoji || '').trim() || getIcono(p.categoria || '');

  const limpiarPrecio = (precio: any): number => {
    const num = parseFloat(precio?.toString().replace(',', '.'));
    return isNaN(num) ? 0 : num;
  };

  /** Suma 1 sin pasar de las existencias. Devuelve el carrito ya cambiado. */
  const sumarSiCabe = (
    prev: ItemCarrito[],
    producto: any,
    clave: string,
    nuevo: () => ItemCarrito
  ): ItemCarrito[] => {
    // disponibles null = sin inventario cargado, sin límite
    const tope = producto.disponibles;
    if (tope !== null && tope !== undefined) {
      // El tope es por producto: se cuentan todos sus renglones juntos
      const yaEnCarrito = prev
        .filter(i => i.id === producto.id)
        .reduce((n, i) => n + i.cantidad, 0);
      if (yaEnCarrito >= tope) {
        setAvisoStock(
          tope <= 0
            ? `${producto.nombre} se agotó por hoy 😔`
            : `Solo nos ${tope === 1 ? 'queda 1' : `quedan ${tope}`} de ${producto.nombre}`
        );
        return prev;
      }
    }
    if (prev.some(i => i.clave === clave)) {
      return prev.map(i => (i.clave === clave ? { ...i, cantidad: i.cantidad + 1 } : i));
    }
    return [...prev, nuevo()];
  };

  const agregarAlCarrito = (
    producto: any,
    tamano?: string,
    eleccion?: Eleccion,
    /** undefined = todavía no se le preguntó; [] = eligió no llevar ninguno */
    extras?: Extra[]
  ) => {
    if (producto.disponible === false) {
      setAvisoStock(`${producto.nombre} no está disponible por el momento`);
      return;
    }
    // No se puede agregar a ciegas algo que el cliente tiene que decidir:
    // se abre la ficha. Con los toppings no llevar ninguno es una respuesta
    // válida, pero hay que dejarle verlos antes de darla por hecha.
    const tamanos: Tamano[] = producto.tamanos ?? [];
    const grupos: GrupoOpcion[] = producto.opciones ?? [];
    const extrasProducto: Extra[] = producto.extras ?? [];
    if (
      (tamanos.length > 0 && !tamano) ||
      (grupos.length > 0 && grupos.some((g) => !eleccion?.[g.nombre])) ||
      (extrasProducto.length > 0 && extras === undefined)
    ) {
      abrirDetalle(producto);
      return;
    }
    const elegidos = extras ?? [];
    const base = tamano
      ? precioDeTamano(tamanos, tamano) ?? limpiarPrecio(producto.precio)
      : limpiarPrecio(producto.precio);
    const precio = base + precioExtras(elegidos);
    const clave = claveLinea(
      producto.id,
      tamano,
      `${claveEleccion(grupos, eleccion)}#${claveExtras(elegidos)}`
    );

    setCarrito(prev =>
      sumarSiCabe(prev, producto, clave, () => ({
        id: producto.id,
        nombre: producto.nombre,
        precio,
        categoria: producto.categoria,
        cantidad: 1,
        tamano: tamano ?? '',
        opciones: eleccion ?? {},
        extras: elegidos,
        clave,
      }))
    );
  };

  /** El "+" del carrito: el renglón ya existe, solo sube la cantidad. */
  const sumarUnoAlCarrito = (clave: string) => {
    const item = carrito.find(i => i.clave === clave);
    if (!item) return;
    const producto = productos.find(p => p.id === item.id) ?? { id: item.id, nombre: item.nombre };
    setCarrito(prev => sumarSiCabe(prev, producto, clave, () => item));
  };

  const eliminarDelCarrito = (clave: string) => {
    setCarrito(prev => {
      const item = prev.find(i => i.clave === clave);
      if (!item) return prev;
      if (item.cantidad > 1) {
        return prev.map(i => (i.clave === clave ? { ...i, cantidad: i.cantidad - 1 } : i));
      }
      const nuevo = prev.filter(i => i.clave !== clave);
      if (nuevo.length === 0) setVerCarrito(false);
      return nuevo;
    });
  };

  const guardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorTelefono('');

    // Validar lada — solo dígitos, 1-3 caracteres
    const ladaLimpia = ladaUsuario.replace(/\D/g, '');
    if (!ladaLimpia || ladaLimpia.length > 3) {
      setErrorTelefono('Lada inválida (1-3 dígitos)');
      return;
    }

    // Validar número — solo dígitos, longitud según lada
    const numeroLimpio = telefonoUsuario.replace(/\D/g, '');
    if (ladaLimpia === '52') {
      if (numeroLimpio.length !== 10) {
        setErrorTelefono('El número debe tener 10 dígitos');
        return;
      }
    } else {
      if (numeroLimpio.length < 7 || numeroLimpio.length > 15) {
        setErrorTelefono('El número debe tener entre 7 y 15 dígitos');
        return;
      }
    }

    // Formato final: +528186003207
    const telefonoCompleto = `+${ladaLimpia}${numeroLimpio}`;

    if (session) {
      try {
        const res = await fetch('/api/usuario', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombreUsuario,
            telefono: telefonoCompleto,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Ej: el número ya está en la cuenta de Google de otra persona
          setErrorTelefono(data.error || 'No se pudo guardar. Intenta de nuevo.');
          return;
        }
        // Si su número ya estaba en el mostrador, se le juntaron las
        // compras y hay que contárselo: si no, sus pedidos "aparecen" de
        // la nada y su avance de lealtad da un salto sin explicación.
        if (data.aviso) {
          setAvisoStock(data.aviso);
          setLealtad(null); // se vuelve a leer con el avance ya juntado
        }
      } catch {
        // Si falla por red, ya quedará en localStorage abajo. No bloqueamos.
      }
    }

    localStorage.setItem('moramango_nombre', nombreUsuario);
    localStorage.setItem('moramango_telefono', telefonoCompleto);
    setVerPerfil(false);
  };

  // Abrir detalle solo si hay descripción — evita modal vacío
  // Un carrito de antes puede traer un combo sin queso elegido, o un jugo
  // sin tamaño. Al confirmar el pedido el servidor lo rechazaría y el
  // cliente se quedaría atorado sin entender por qué, así que se sacan del
  // carrito en cuanto se sabe qué pide hoy cada producto.
  useEffect(() => {
    if (productos.length === 0) return;
    const limpio = carrito.filter((item) => {
      const p = productos.find((x) => x.id === item.id);
      if (!p) return true; // producto desconocido: lo resuelve el servidor
      const faltaTamano = (p.tamanos ?? []).length > 0 && !item.tamano;
      const faltaElegir = (p.opciones ?? []).some((g: GrupoOpcion) => !item.opciones?.[g.nombre]);
      return !faltaTamano && !faltaElegir;
    });
    if (limpio.length === carrito.length) return;
    setCarrito(limpio);
    setAvisoStock('Quitamos algo de tu carrito porque ahora se pide con opciones. Vuelve a agregarlo.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, carrito]);

  const abrirDetalle = (producto: any) => {
    const tamanos: Tamano[] = producto.tamanos ?? [];
    const grupos: GrupoOpcion[] = producto.opciones ?? [];
    // Con tamaños u opciones la ficha se abre siempre: es donde se elige
    const hayQueElegir =
      tamanos.length > 0 || grupos.length > 0 || (producto.extras ?? []).length > 0;
    if (!hayQueElegir && !(producto.descripcion && producto.descripcion.trim())) return;
    setTamanoElegido(tamanos[0]?.nombre ?? '');
    setOpcionesElegidas({});
    setGrupoAbierto(null);
    setExtrasElegidos([]); // los toppings arrancan sin marcar
    setProductoDetalle(producto);
  };

  const totalArticulos = carrito.reduce((total, item) => total + item.cantidad, 0);
  const totalBruto = carrito.reduce((total, item) => total + (item.precio * item.cantidad), 0);

  const descuentoAplicado = (() => {
    if (!beneficioAplicado || !lealtad) return 0;
    const b = lealtad.beneficioDisponible;
    if (b === '15% Descuento') return totalBruto * 0.15;
    if (esReactivacion(b)) return Math.min(montoReactivacion(b), totalBruto);
    return 0;
  })();

  const totalPagar = totalBruto - descuentoAplicado;

  const beneficioCanjeadoStr = (() => {
    if (!beneficioAplicado || !lealtad) return 'Ninguno';
    return lealtad.beneficioDisponible;
  })();

  const mensajeLealtad = (() => {
    if (!session || !lealtad || cargandoLealtad) return null;

    const b = lealtad.beneficioDisponible;

    if (b === 'Articulo Gratis') {
      return {
        emoji: '🎉',
        texto: '¡Tienes un licuado o jugo gratis disponible (hasta $35)! Agrégalo a tu pedido si quieres usarlo.',
        tipo: 'gratis',
      };
    }
    if (b === '15% Descuento') {
      return {
        emoji: '🏷️',
        texto: '¡Tienes 15% de descuento disponible! Puedes aplicarlo a este pedido.',
        tipo: 'descuento',
      };
    }
    if (esReactivacion(b)) {
      return {
        emoji: '💛',
        texto: `¡Te extrañamos! Tienes $${montoReactivacion(b)} de descuento disponible. Puedes aplicarlo a este pedido.`,
        tipo: 'descuento',
      };
    }
    if (lealtad.pedidosParaDescuento > 0) {
      return {
        emoji: '⭐',
        texto: `Te faltan ${lealtad.pedidosParaDescuento} pedido${lealtad.pedidosParaDescuento === 1 ? '' : 's'} para obtener 15% de descuento.`,
        tipo: 'progreso',
      };
    }
    return null;
  })();

  // Cargar "Mis pedidos" al abrir la pantalla
  useEffect(() => {
    if (!session || !verMisPedidos) return;
    setCargandoPedidos(true);
    fetch('/api/pedidos')
      .then((res) => res.json())
      .then((data) => setMisPedidos(data.pedidos || []))
      .catch(() => {})
      .finally(() => setCargandoPedidos(false));
  }, [session, verMisPedidos]);

  const abrirOpinion = (idPedido: string) => {
    setOpinando(idPedido);
    setSabor(0);
    setCalidad(0);
    setComentario('');
    setOpinionAnonima(false);
  };

  const enviarOpinion = async (idPedido: string) => {
    if (sabor === 0 || calidad === 0) return;
    setEnviandoOpinion(true);
    try {
      const res = await fetch('/api/opiniones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPedido,
          sabor,
          calidad,
          comentario: comentario.trim(),
          anonimo: opinionAnonima,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'No se pudo enviar tu opinión.');
        return;
      }
      setOpinando(null);
      setGraciasOpinion(idPedido);
      setMisPedidos((prev) =>
        prev.map((p) => (p.idPedido === idPedido ? { ...p, yaOpino: true } : p))
      );
    } catch {
      alert('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviandoOpinion(false);
    }
  };

  // Liquidar un pedido que quedó pendiente de pago
  const pagarPendiente = async (idPedido: string) => {
    setAccionPedido(idPedido);
    try {
      const res = await fetch(`/api/pedidos/${idPedido}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'pagar' }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      alert(data.error || 'No se pudo iniciar el pago.');
    } catch {
      alert('Error de conexión. Intenta de nuevo.');
    } finally {
      setAccionPedido(null);
    }
  };

  // El cliente cancela su propio pedido (solo si no se prepara ni está pagado)
  const cancelarMiPedido = async (idPedido: string) => {
    if (!confirm(`¿Cancelar tu pedido ${idPedido}?`)) return;
    setAccionPedido(idPedido);
    try {
      const res = await fetch(`/api/pedidos/${idPedido}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cancelar' }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'No se pudo cancelar.');
        return;
      }
      // Refrescar la lista
      const r = await fetch('/api/pedidos');
      const d = await r.json();
      setMisPedidos(d.pedidos || []);
    } catch {
      alert('Error de conexión. Intenta de nuevo.');
    } finally {
      setAccionPedido(null);
    }
  };

  /**
   * Vuelve a pedir un pedido anterior. Usa los precios y disponibilidad
   * ACTUALES del menú (no los del pedido viejo): los precios cambian, y
   * un producto puede estar agotado o ya no existir.
   */
  /**
   * Avisa que el cliente ya está en el local. El aviso de Telegram lo
   * manda el servidor (llega solo), y además se abre WhatsApp con el
   * mensaje escrito — ese sí lo tiene que enviar el cliente.
   */
  const avisarLlegada = async (pedido: MiPedido) => {
    setEnviandoAviso(true);
    try {
      const res = await fetch(`/api/pedidos/${encodeURIComponent(pedido.idPedido)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'llegue', nota: notaLlegada }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo enviar el aviso');
        return;
      }

      setAvisoEnviado(pedido.idPedido);
      setAvisando(null);
      window.open(
        linkWhatsApp(TELEFONO_NEGOCIO, mensajeLlegada(pedido.idPedido, notaLlegada)),
        '_blank'
      );
      setNotaLlegada('');

      // Refrescar para que quede la marca de "ya avisaste"
      const r = await fetch('/api/pedidos');
      const d = await r.json();
      setMisPedidos(d.pedidos || []);
    } catch {
      alert('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviandoAviso(false);
    }
  };

  const volverAPedir = (pedido: MiPedido) => {
    const disponibles: ItemCarrito[] = [];
    const noDisponibles: string[] = [];

    for (const item of pedido.items) {
      const actual = productos.find((p) => p.id === item.idProducto);
      if (!actual) {
        noDisponibles.push(item.nombre);
        continue;
      }
      // El pedido guardado trae el tamaño en el nombre: "Jugo de Mango
      // (1 litro)". Se recupera comparándolo con los tamaños que el
      // producto ofrece HOY, para no repetir uno que ya se dejó de vender.
      const tamanos: Tamano[] = actual.tamanos ?? [];
      const tamano = tamanos.find((t) =>
        item.nombre.toLowerCase().endsWith(`(${t.nombre.toLowerCase()})`)
      )?.nombre;
      if (tamanos.length > 0 && !tamano) {
        noDisponibles.push(item.nombre);
        continue;
      }
      // Lo que se eligió (el queso del combo, el sabor del licuado) se
      // recupera del nombre guardado. Si no se puede — porque ese sabor ya
      // no se vende o el pedido es de antes de que existieran las
      // opciones — se manda a elegirlo, en vez de servir otra cosa.
      const grupos: GrupoOpcion[] = actual.opciones ?? [];
      const eleccion = eleccionDesdeNombre(grupos, item.nombre);
      if (eleccion === null) {
        noDisponibles.push(item.nombre);
        continue;
      }

      disponibles.push({
        id: actual.id,
        nombre: actual.nombre,
        precio: tamano
          ? precioDeTamano(tamanos, tamano) ?? limpiarPrecio(actual.precio)
          : limpiarPrecio(actual.precio),
        categoria: actual.categoria,
        cantidad: item.cantidad,
        tamano: tamano ?? '',
        opciones: eleccion,
        extras: [],
        clave: claveLinea(actual.id, tamano, `${claveEleccion(grupos, eleccion)}#`),
      });
    }

    if (disponibles.length === 0) {
      setAvisoRepetir('Ninguno de esos productos está disponible ahora mismo.');
      return;
    }

    // Se suman al carrito respetando lo que ya hubiera dentro
    setCarrito((prev) => {
      const nuevo = [...prev];
      for (const item of disponibles) {
        const existe = nuevo.find((i) => i.id === item.id);
        if (existe) existe.cantidad += item.cantidad;
        else nuevo.push(item);
      }
      return nuevo;
    });

    setAvisoRepetir(
      noDisponibles.length > 0
        ? `Agregamos tu pedido, pero ${noDisponibles.join(', ')} ya no está disponible.`
        : ''
    );
    setVerMisPedidos(false);
    setVerCarrito(true);
  };

  const copiarCodigo = async () => {
    const codigo = (session?.user as any)?.id_usuario;
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCodigoCopiado(true);
      setTimeout(() => setCodigoCopiado(false), 2000);
    } catch {
      // Si el navegador bloquea el portapapeles, el código se ve igual en pantalla
    }
  };

  const copiarClabe = async () => {
    try {
      await navigator.clipboard.writeText(TRANSFERENCIA.clabe);
      setClabeCopiada(true);
      setTimeout(() => setClabeCopiada(false), 2000);
    } catch {
      // Si el navegador bloquea el portapapeles, el usuario puede copiar a mano
    }
  };

  const copiarConcepto = async () => {
    if (!pedidoConfirmado) return;
    try {
      await navigator.clipboard.writeText(pedidoConfirmado);
      setConceptoCopiado(true);
      setTimeout(() => setConceptoCopiado(false), 2000);
    } catch {}
  };

  const confirmarOrden = async () => {
    if (carrito.length === 0 || !tienda.abierta) return;

    if (!session) {
      sessionStorage.setItem('moramango_login_redirect', 'confirmar');
      signIn('google', { callbackUrl: '/' });
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: carrito.map(item => ({
            id: item.id,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
            tamano: item.tamano,
            opciones: item.opciones,
            extras: item.extras,
          })),
          notas: notas.trim(),
          horaRecoleccion: horaRecoger,
          beneficioCanjeado: beneficioCanjeadoStr,
          pagoEnLinea: formaPago === 'linea',
          metodoPago: formaPago === 'transferencia' ? 'Transferencia' : '',
        }),
      });

      const data = await res.json();

      if (data.success) {
        const fueTransferencia = formaPago === 'transferencia';
        setTotalPagarConfirmado(totalPagar); // congelar antes de vaciar el carrito
        setCarrito([]);
        localStorage.removeItem(CARRITO_KEY);
        setVerCarrito(false);
        setNotas('');
        setBeneficioAplicado(false);
        setLealtad(null);
        setFormaPago('recoger');
        setHoraRecoger('');

        if (data.checkoutUrl) {
          // Ir al checkout de Mercado Pago; al terminar regresa con ?pago=...
          window.location.href = data.checkoutUrl;
          return;
        }
        // Eligió tarjeta pero el cobro no se pudo abrir: hay que decírselo,
        // porque si no cree que ya pagó y llega al local sin pagar.
        if (data.avisoPago) alert(data.avisoPago);

        setPedidoPorTransferencia(fueTransferencia);
        setPedidoConfirmado(data.idPedido);
      } else {
        alert('Hubo un error al procesar tu pedido. Intenta de nuevo.');
      }
    } catch {
      alert('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (pedidoConfirmado) {
    return (
      <main className="h-[100dvh] bg-neutral-200 font-sans flex justify-center overflow-hidden">
        <div className="w-full max-w-md bg-neutral-50 shadow-2xl flex flex-col items-center justify-center p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-black mb-2">¡Pedido recibido!</h2>
          {pagoExitoso && (
            <p className="text-sm font-semibold text-green-600 mb-2">💳 Pago en línea recibido</p>
          )}
          <p className="text-neutral-700 mb-2">Tu número de pedido es:</p>
          <p className="text-lg font-mono font-bold text-black bg-neutral-100 px-4 py-2 rounded-xl mb-6">
            {pedidoConfirmado}
          </p>
          {pedidoPorTransferencia && TRANSFERENCIA_HABILITADA && (
            <div className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6 text-left">
              <p className="text-sm font-semibold text-black mb-2">📲 Falta tu transferencia</p>
              <p className="text-xs text-neutral-600 mb-3">
                Transfiere el total a esta CLABE y pon tu <b>número de pedido</b> en el concepto:
              </p>
              <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-neutral-200 p-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">CLABE</p>
                  <span className="font-mono font-bold text-black text-sm break-all">{TRANSFERENCIA.clabe}</span>
                </div>
                <button
                  onClick={copiarClabe}
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    clabeCopiada ? 'bg-green-600 text-white' : 'bg-marron text-white'
                  }`}
                >
                  {clabeCopiada ? '✓' : 'Copiar'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-neutral-200 p-2.5 mt-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">Concepto</p>
                  <span className="font-mono font-bold text-black text-sm break-all">{pedidoConfirmado}</span>
                </div>
                <button
                  onClick={copiarConcepto}
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    conceptoCopiado ? 'bg-green-600 text-white' : 'bg-marron text-white'
                  }`}
                >
                  {conceptoCopiado ? '✓' : 'Copiar'}
                </button>
              </div>
              <a
                href={linkWhatsApp(
                  TELEFONO_NEGOCIO,
                  mensajeComprobante(pedidoConfirmado!, totalPagarConfirmado)
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-bold py-3 rounded-xl active:scale-95 transition-transform"
              >
                📲 Enviar mi comprobante por WhatsApp
              </a>
            </div>
          )}
          <div className="mb-6 text-left">
            <BloqueDireccion titulo="Aquí lo recoges" />
          </div>
          <p className="text-sm text-neutral-700 leading-relaxed mb-8">
            Recibirás una notificación cuando tu pedido esté listo para recoger.
          </p>
          <button
            onClick={() => setPedidoConfirmado(null)}
            className="bg-marron text-white font-bold py-3 px-8 rounded-2xl active:scale-95 transition-transform"
          >
            Hacer otro pedido
          </button>
        </div>
      </main>
    );
  }

  // Info del producto en detalle (para el modal)
  const tamanosDetalle: Tamano[] = productoDetalle?.tamanos ?? [];
  const gruposDetalle: GrupoOpcion[] = productoDetalle?.opciones ?? [];
  const extrasDetalle: Extra[] = productoDetalle?.extras ?? [];
  /** Opciones que hoy no se pueden preparar (el jugo se acabó, etc.) */
  const agotadasDetalle: string[] = productoDetalle?.opcionesAgotadas ?? [];
  /** Grupos que todavía no contesta. Sin preselección, hay que exigirlo. */
  const faltanPorElegir = gruposDetalle
    .filter((g) => !opcionesElegidas[g.nombre])
    .map((g) => g.nombre.toLowerCase());
  const claveDetalle = productoDetalle
    ? claveLinea(
        productoDetalle.id,
        tamanoElegido,
        `${claveEleccion(gruposDetalle, opcionesElegidas)}#${claveExtras(extrasElegidos)}`
      )
    : '';
  const itemEnCarritoDetalle = productoDetalle
    ? carrito.find(i => i.clave === claveDetalle)
    : null;
  const cantidadEnCarritoDetalle = itemEnCarritoDetalle?.cantidad ?? 0;
  // El precio que se muestra y se cobra es el del tamaño elegido
  const precioDetalle = productoDetalle
    ? (tamanosDetalle.length > 0
        ? precioDeTamano(tamanosDetalle, tamanoElegido) ?? 0
        : limpiarPrecio(productoDetalle.precio)) + precioExtras(extrasElegidos)
    : 0;

  return (
    <main className="h-[100dvh] bg-neutral-200 font-sans flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-neutral-50 shadow-2xl flex flex-col relative h-full">

        {/* PANTALLA 1: MENÚ */}
        <div className={`flex flex-col h-full ${verCarrito || verPerfil || verMisPedidos ? 'hidden' : 'flex'}`}>
          <header className="bg-white pt-6 pb-2 sticky top-0 z-20 shadow-sm rounded-b-3xl shrink-0">
            <div className="px-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="Moramango" className="w-full h-full object-contain"
                    onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-black leading-none">Moramango</h1>
                  <p className="text-xs text-neutral-700 font-medium mt-1">Blend to Go</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={linkWhatsApp(
                    TELEFONO_NEGOCIO,
                    '¡Hola Moramango! 🥭 Quisiera hacer una pregunta.'
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-lg active:scale-90 transition-transform"
                  title="Contáctanos por WhatsApp"
                  aria-label="Contáctanos por WhatsApp"
                >
                  💬
                </a>
                {(session?.user as any)?.rol === 'admin' && (
                  <Link
                    href="/admin"
                    className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg active:scale-90 transition-transform"
                    title="Panel de Admin"
                  >
                    ⚙️
                  </Link>
                )}
                <button
                  onClick={() => session ? setVerPerfil(true) : signIn('google', { callbackUrl: '/' })}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform ${
                    session ? 'bg-marron text-white' : 'bg-neutral-100 text-black'
                  }`}
                >
                  {session ? '👤' : '🔑'}
                </button>
              </div>
            </div>

            {!tienda.abierta && (
              <div className="mx-4 mt-4 bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex gap-3 items-start">
                <span className="text-lg leading-none">🕐</span>
                <div>
                  <p className="font-bold text-amber-900 text-sm">Ahorita estamos cerrados</p>
                  <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                    {tienda.mensaje} Puedes ver el menú y dejar listo tu carrito.
                  </p>
                </div>
              </div>
            )}

            <div className="relative">
            <div
              ref={filaCategorias}
              className="flex overflow-x-auto gap-4 mt-6 px-4 pb-4"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style jsx>{`div::-webkit-scrollbar { display: none; }`}</style>
              {categoriasMenu.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoriaActiva(cat)}
                  className="flex flex-col items-center justify-center min-w-[70px] transition-transform active:scale-95"
                >
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-2 shadow-sm transition-colors ${
                    categoriaActiva === cat ? 'bg-marron text-white' : 'bg-neutral-100 text-black'
                  }`}>
                    {cat === 'Todos' ? '✨' : getIcono(cat)}
                  </div>
                  <span className={`text-xs capitalize ${categoriaActiva === cat ? 'font-bold text-black' : 'font-medium text-neutral-700'}`}>
                    {cat}
                  </span>
                </button>
              ))}
            </div>

            {/* Aviso al topar con el stock; se va solo */}
            {avisoStock && (
              <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-50 bg-neutral-900 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg max-w-[90vw] text-center">
                {avisoStock}
              </div>
            )}

            {/* Pista de que hay más categorías a la derecha */}
            {hayMasCategorias && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-20 flex items-center justify-end pr-2 bg-gradient-to-l from-white via-white/85 to-transparent">
                <span className="w-8 h-8 rounded-full bg-marron text-white flex items-center justify-center text-lg font-bold shadow-md animate-pulse">
                  ›
                </span>
              </div>
            )}
            </div>
          </header>

          <div
            className="p-4 flex-1 overflow-y-auto pb-32"
            style={{
              backgroundImage:
                'linear-gradient(rgba(250,250,249,0.85), rgba(250,250,249,0.85)), url(/fondo-menu.jpg)',
              backgroundSize: 'cover, 460px',
              backgroundRepeat: 'no-repeat, repeat',
            }}
          >
            {avisoPago && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex gap-3 items-start">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <p className="flex-1 text-xs text-amber-800 leading-relaxed">{avisoPago}</p>
                <button
                  onClick={() => setAvisoPago('')}
                  className="text-amber-400 text-sm font-bold px-1"
                  aria-label="Cerrar aviso"
                >
                  ✕
                </button>
              </div>
            )}
            {cargando ? (
              <div className="flex justify-center items-center py-10">
                <p className="text-neutral-700 animate-pulse font-medium">Preparando menú...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(productosPorCategoria).map(([categoria, items]) => {
                  if (categoriaActiva !== 'Todos' && categoriaActiva !== categoria) return null;
                  return (
                    <section key={categoria}>
                      <h2 className="text-xl font-bold text-neutral-900 mb-4 capitalize">{categoria}</h2>
                      <div className="space-y-4">
                        {(items as any[]).map((producto, index) => {
                          // Con tamaños, el mismo producto ocupa varios
                          // renglones del carrito: se suman todos
                          const cantidadAgregada = carrito
                            .filter(item => item.id === producto.id)
                            .reduce((n, item) => n + item.cantidad, 0);
                          const tamanosProd: Tamano[] = producto.tamanos ?? [];
                          const gruposProd: GrupoOpcion[] = producto.opciones ?? [];
                          const tieneTamanos = tamanosProd.length > 0;
                          // Con opciones tampoco se puede sumar/restar desde
                          // la tarjeta: hay que saber cuál de los renglones
                          const extrasProd: Extra[] = producto.extras ?? [];
                          const hayQueElegir =
                            tieneTamanos || gruposProd.length > 0 || extrasProd.length > 0;
                          const tieneDescripcion = producto.descripcion && producto.descripcion.trim();
                          const venta = estadoDeVenta(producto);

                          return (
                            <div
                              key={producto.id || index}
                              className={`flex gap-4 p-4 rounded-3xl bg-white shadow-sm border border-neutral-100 ${
                                venta.sePuedeComprar ? '' : 'opacity-70'
                              }`}
                            >
                              {/* Área de texto — tappable si tiene descripción */}
                              <button
                                onClick={() => abrirDetalle(producto)}
                                disabled={!tieneDescripcion}
                                className={`flex-1 flex flex-col justify-center text-left ${
                                  tieneDescripcion ? 'active:opacity-70 transition-opacity' : 'cursor-default'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-neutral-900 leading-tight">{producto.nombre}</h3>
                                  {tieneDescripcion && (
                                    <span className="text-neutral-600 text-xs">›</span>
                                  )}
                                </div>
                                {producto.descripcion && (
                                  <p className="text-xs text-neutral-700 mt-1.5 line-clamp-2 leading-relaxed">
                                    {producto.descripcion}
                                  </p>
                                )}
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-neutral-900">
                                    {tieneTamanos && (
                                      <span className="font-semibold text-neutral-700 text-xs mr-1">
                                        desde
                                      </span>
                                    )}
                                    ${precioDesde(tamanosProd, limpiarPrecio(producto.precio)).toFixed(2)}
                                  </span>
                                  {tieneTamanos && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                                      {tamanosProd.map(t => t.nombre).join(' · ')}
                                    </span>
                                  )}
                                  {venta.etiqueta && (
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        venta.apagado
                                          ? 'bg-neutral-200 text-neutral-600'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {!venta.apagado && '🔥 '}
                                      {venta.etiqueta}
                                    </span>
                                  )}
                                </div>
                              </button>

                              <div className="relative shrink-0 ml-2">
                                <button
                                  onClick={() => agregarAlCarrito(producto)}
                                  disabled={!venta.sePuedeComprar}
                                  className="w-24 h-24 bg-neutral-100 rounded-2xl overflow-hidden flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
                                  aria-label={`Agregar ${producto.nombre}`}
                                >
                                  {/* object-contain + padding: los iconos son
                                      cuadrados con fondo propio y con cover se
                                      recortaban y llenaban toda la caja */}
                                  <FotoProducto
                                    key={producto.imagen}
                                    src={producto.imagen}
                                    alt={producto.nombre}
                                    className="w-full h-full object-contain p-2"
                                    respaldo={
                                      <span
                                        className={
                                          producto.emoji ? 'text-5xl' : 'text-5xl opacity-20'
                                        }
                                      >
                                        {iconoProducto(producto)}
                                      </span>
                                    }
                                  />
                                </button>

                                {/* Indicador + para agregar (solo si no está en el carrito) */}
                                {cantidadAgregada === 0 && venta.sePuedeComprar && (
                                  <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-marron text-white rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                                    <span className="text-xl font-medium leading-none">+</span>
                                  </div>
                                )}
                                
                                {cantidadAgregada > 0 && hayQueElegir && (
                                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-b-2xl px-1.5 py-1 shadow-sm">
                                    <span className="text-sm font-bold text-neutral-900 tabular-nums">
                                      {cantidadAgregada} en tu pedido
                                    </span>
                                  </div>
                                )}

                                {cantidadAgregada > 0 && !hayQueElegir && (
                                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-white/90 backdrop-blur-sm rounded-b-2xl px-1.5 py-1 shadow-sm">
                                    <button
                                      onClick={() => eliminarDelCarrito(claveLinea(producto.id))}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-100 active:scale-90 transition-transform text-neutral-900"
                                    >
                                      {cantidadAgregada === 1 ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                        </svg>
                                      ) : (
                                        <span className="text-base font-medium leading-none">−</span>
                                      )}
                                    </button>
                                    <span className="text-sm font-bold text-neutral-900 min-w-[16px] text-center tabular-nums">
                                      {cantidadAgregada}
                                    </span>
                                    <button
                                      onClick={() => agregarAlCarrito(producto)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-marron text-white active:scale-90 transition-transform"
                                    >
                                      <span className="text-base font-medium leading-none">+</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {/* Al final del menú, para quien solo quiere saber dónde
                    estamos sin tener que iniciar sesión ni pedir nada. */}
                <BloqueDireccion titulo="Dónde estamos" />
              </div>
            )}
          </div>

          {totalArticulos > 0 && (
            <div className="absolute bottom-6 left-4 right-4 z-30">
              <button
                onClick={() => setVerCarrito(true)}
                className="w-full bg-marron text-white p-4 rounded-2xl flex justify-between items-center shadow-[0_10px_40px_rgba(0,0,0,0.3)] active:scale-95 transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-white text-black w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                    {totalArticulos}
                  </div>
                  <span className="font-semibold text-sm">Ver pedido</span>
                </div>
                <div className="font-bold text-lg">${totalPagar.toFixed(2)}</div>
              </button>
            </div>
          )}
        </div>

        {/* PANTALLA 2: CARRITO */}
        {verCarrito && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button onClick={() => setVerCarrito(false)} className="w-10 h-10 flex items-center justify-center bg-marron/15 text-marron rounded-full font-bold text-2xl leading-none active:scale-90 mr-3">←</button>
              <h2 className="text-xl font-bold text-black">Tu Pedido</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {avisoRepetir && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex gap-3 items-start">
                  <span className="text-base leading-none mt-0.5">⚠️</span>
                  <p className="flex-1 text-xs text-amber-800 leading-relaxed">{avisoRepetir}</p>
                  <button
                    onClick={() => setAvisoRepetir('')}
                    className="text-amber-400 text-sm font-bold px-1"
                    aria-label="Cerrar aviso"
                  >
                    ✕
                  </button>
                </div>
              )}
              {carrito.map((item) => (
                <div key={item.clave} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-neutral-100">
                  <div className="pr-4 flex-1">
                    <h3 className="font-semibold text-neutral-900 leading-tight">{item.nombre}</h3>
                    {/* Con el nombre del grupo delante: "Fresa · No" no dice
                        si el fresa es el licuado ni a qué se contestó que no. */}
                    {(() => {
                      const partes = [
                        item.tamano,
                        ...Object.entries(item.opciones ?? {})
                          .filter(([, v]) => v)
                          .map(([g, v]) => `${g}: ${v}`),
                        resumenExtras(item.extras ?? []),
                      ].filter(Boolean);
                      if (partes.length === 0) return null;
                      return (
                        <p className="text-xs text-neutral-700 font-medium mt-0.5">
                          {partes.join(' · ')}
                        </p>
                      );
                    })()}
                    <p className="text-neutral-800 font-semibold text-sm mt-1">${(item.precio * item.cantidad).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center bg-neutral-100 rounded-xl p-1 gap-2 shrink-0">
                    <button onClick={() => eliminarDelCarrito(item.clave)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-bold text-neutral-900 shadow-sm active:scale-90">-</button>
                    <span className="font-bold text-neutral-900 px-1 min-w-[16px] text-center">{item.cantidad}</span>
                    <button onClick={() => sumarUnoAlCarrito(item.clave)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-bold text-neutral-900 shadow-sm active:scale-90">+</button>
                  </div>
                </div>
              ))}

              {session && (
                <div className="mt-2">
                  {cargandoLealtad && (
                    <div className="bg-neutral-100 rounded-2xl p-3.5 animate-pulse h-12" />
                  )}
                  {!cargandoLealtad && mensajeLealtad && (
                    <div className={`rounded-2xl p-3.5 border flex gap-3 items-start ${
                      mensajeLealtad.tipo === 'gratis' ? 'bg-amber-50 border-amber-200' :
                      mensajeLealtad.tipo === 'descuento' ? 'bg-green-50 border-green-200' :
                      'bg-neutral-50 border-neutral-200'
                    }`}>
                      <span className="text-lg leading-none mt-0.5">{mensajeLealtad.emoji}</span>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-700 leading-relaxed">{mensajeLealtad.texto}</p>
                        {mensajeLealtad.tipo === 'descuento' && (
                          <button
                            onClick={() => setBeneficioAplicado(prev => !prev)}
                            className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                              beneficioAplicado
                                ? 'bg-green-600 text-white'
                                : 'bg-marron text-white'
                            }`}
                          >
                            {beneficioAplicado
                              ? '✓ Descuento aplicado'
                              : lealtad?.beneficioDisponible === '15% Descuento'
                              ? 'Aplicar 15% de descuento'
                              : `Aplicar $${montoReactivacion(lealtad?.beneficioDisponible || '')} de descuento`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ¿A qué hora pasa por él? Descarga la hora pico: se prepara
                  con tiempo en vez de tener a todos esperando parados. */}
              {horariosRecoleccion.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-sm">
                  <label className="text-sm font-semibold text-neutral-700 block mb-2">
                    ¿A qué hora pasas por él?
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    <button
                      onClick={() => setHoraRecoger('')}
                      className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        horaRecoger === ''
                          ? 'border-marron bg-marron/10 text-neutral-900'
                          : 'border-neutral-200 bg-white text-neutral-800'
                      }`}
                    >
                      Lo antes posible
                    </button>
                    {horariosRecoleccion.map((h) => (
                      <button
                        key={h.valor}
                        onClick={() => setHoraRecoger(h.valor)}
                        className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                          horaRecoger === h.valor
                            ? 'border-marron bg-marron/10 text-neutral-900'
                            : 'border-neutral-200 bg-white text-neutral-800'
                        }`}
                      >
                        {h.etiqueta}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-700 mt-2">
                    {horaRecoger
                      ? 'Lo tendremos listo a esa hora.'
                      : 'Lo preparamos en cuanto entre tu pedido.'}
                  </p>
                </div>
              )}

              <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-sm">
                <label className="text-sm font-semibold text-neutral-700 block mb-2">Notas del pedido</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Sin mayonesa, sin tomate, extra salsa..."
                  rows={3}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-600 focus:outline-none focus:border-marron transition-colors resize-none"
                />
              </div>
            </div>

            {/* Panel compacto: cada renglón que crece aquí le come espacio
                a la lista de productos, que es lo que el cliente revisa */}
            <div className="bg-white px-5 pt-4 pb-5 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border-t border-neutral-100 shrink-0">
              {beneficioAplicado && descuentoAplicado > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="flex justify-between items-center text-sm text-neutral-700">
                    <span>Subtotal</span>
                    <span>${totalBruto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                    <span>Descuento 15%</span>
                    <span>-${descuentoAplicado.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mb-2.5">
                <span className="text-neutral-700 font-medium">Total a pagar</span>
                <span className="text-2xl font-bold text-black">${totalPagar.toFixed(2)}</span>
              </div>

              {session && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-neutral-700 mb-1.5">¿Cómo quieres pagar?</p>
                  {/* En fila: apiladas ocupaban tres renglones completos */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setFormaPago('recoger')}
                      className={`py-2 px-1 rounded-xl text-[11px] font-semibold leading-tight transition-colors ${
                        formaPago === 'recoger' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <span className="block text-base">🏪</span>
                      Al recoger
                    </button>
                    {TRANSFERENCIA_HABILITADA && (
                      <button
                        onClick={() => setFormaPago('transferencia')}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold leading-tight transition-colors ${
                          formaPago === 'transferencia' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        <span className="block text-base">📲</span>
                        Transferencia
                      </button>
                    )}
                    <button
                      onClick={() => setFormaPago('linea')}
                      className={`py-2 px-1 rounded-xl text-[11px] font-semibold leading-tight transition-colors ${
                        formaPago === 'linea' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <span className="block text-base">💳</span>
                      Tarjeta
                    </button>
                  </div>

                  {formaPago === 'recoger' && (
                    <div className="mt-3">
                      <BloqueDireccion titulo="Nos encuentras aquí" />
                    </div>
                  )}

                  {formaPago === 'linea' && (
                    <p className="text-xs text-neutral-700 mt-2">
                      Te llevaremos a Mercado Pago para completar el pago de forma segura.
                    </p>
                  )}

                  {formaPago === 'transferencia' && (
                    <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
                      <p className="text-xs text-neutral-600 mb-3">
                        Transfiere <span className="font-bold text-black">${totalPagar.toFixed(2)}</span> a
                        esta cuenta (SPEI, desde cualquier banco):
                      </p>
                      <div className="bg-white rounded-xl border border-neutral-200 p-3 space-y-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">CLABE</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-black text-base tracking-wide break-all">
                              {TRANSFERENCIA.clabe}
                            </span>
                            <button
                              onClick={copiarClabe}
                              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                                clabeCopiada ? 'bg-green-600 text-white' : 'bg-marron text-white'
                              }`}
                            >
                              {clabeCopiada ? '✓ Copiada' : 'Copiar'}
                            </button>
                          </div>
                        </div>
                        {TRANSFERENCIA.titular && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">Titular</p>
                            <p className="text-sm text-neutral-800">{TRANSFERENCIA.titular}</p>
                          </div>
                        )}
                        {TRANSFERENCIA.banco && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-neutral-600 font-semibold">Banco</p>
                            <p className="text-sm text-neutral-800">{TRANSFERENCIA.banco}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-neutral-700 mt-3 leading-relaxed">
                        Al confirmar registramos tu pedido. Haz la transferencia y muestra tu comprobante
                        al recoger (o envíalo por WhatsApp).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!session && (
                <div className="mb-4 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 flex gap-3 items-start">
                  <span className="text-base leading-none mt-0.5">🔑</span>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Para confirmar tu pedido necesitas iniciar sesión con Google. Tu carrito se conserva.
                  </p>
                </div>
              )}

              {!tienda.abierta && (
                <div className="mb-4 bg-amber-50 p-3.5 rounded-xl border border-amber-300 flex gap-3 items-start">
                  <span className="text-base leading-none mt-0.5">🕐</span>
                  <p className="text-xs text-amber-900 font-semibold leading-relaxed">
                    Ahorita estamos cerrados. {tienda.mensaje} Tu carrito se guarda para cuando
                    abramos.
                  </p>
                </div>
              )}

              <button
                onClick={confirmarOrden}
                disabled={enviando || !tienda.abierta}
                className="w-full bg-marron text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
              >
                {!tienda.abierta
                  ? 'Cerrado por ahora'
                  : enviando
                    ? 'Enviando...'
                    : session
                      ? 'Confirmar Orden'
                      : 'Iniciar sesión para pedir'}
              </button>
            </div>
          </div>
        )}

        {/* Confirmar antes de repetir. Se pide porque "volver a pedir" no
            abre nada: mete el pedido al carrito tal cual, y quien no lo
            sabe se encuentra con un pedido que ya no queria igual. */}
        {confirmarRepetir && (
          <div className="absolute inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85%] overflow-y-auto p-5">
              <h3 className="text-lg font-bold text-black">¿Pedir lo mismo?</h3>
              <p className="text-sm text-neutral-700 mt-1">
                Vamos a agregar a tu carrito exactamente esto:
              </p>

              <ul className="mt-3 space-y-2">
                {confirmarRepetir.items.map((item, idx) => (
                  <li key={idx} className="bg-neutral-50 rounded-xl px-3 py-2">
                    <span className="text-sm font-semibold text-black">
                      {item.cantidad}× {item.nombre}
                    </span>
                  </li>
                ))}
              </ul>

              {confirmarRepetir.notas?.trim() && (
                <p className="mt-2 text-xs text-neutral-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  📝 Aquella vez escribiste: <b>{confirmarRepetir.notas.trim()}</b>
                  <span className="block mt-1 text-neutral-600">
                    Esta nota <b>no</b> se copia. Si la quieres otra vez, escríbela al pagar.
                  </span>
                </p>
              )}

              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    const pedido = confirmarRepetir;
                    setConfirmarRepetir(null);
                    volverAPedir(pedido);
                  }}
                  className="w-full bg-marron text-white font-bold py-3.5 rounded-xl active:scale-95"
                >
                  Sí, quiero lo mismo
                </button>
                <button
                  onClick={() => {
                    setConfirmarRepetir(null);
                    setVerMisPedidos(false);
                  }}
                  className="w-full bg-neutral-100 text-neutral-800 font-bold py-3.5 rounded-xl active:scale-95"
                >
                  No, quiero cambiarle algo
                </button>
              </div>
              <p className="text-xs text-neutral-600 mt-2 text-center">
                Si le cambias algo, armas tu pedido desde el menú como siempre.
              </p>
            </div>
          </div>
        )}

        {/* PANTALLA 4: MIS PEDIDOS */}
        {verMisPedidos && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button
                onClick={() => setVerMisPedidos(false)}
                className="w-10 h-10 flex items-center justify-center bg-marron/15 text-marron rounded-full font-bold text-2xl leading-none active:scale-90 mr-3"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-black">Mis pedidos</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cargandoPedidos ? (
                <p className="text-neutral-700 animate-pulse text-center py-8">Cargando tus pedidos...</p>
              ) : misPedidos.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-3">🧾</div>
                  <p className="text-neutral-700">Todavía no has hecho ningún pedido.</p>
                  <button
                    onClick={() => setVerMisPedidos(false)}
                    className="mt-4 bg-marron text-white font-bold py-3 px-6 rounded-2xl active:scale-95 transition-transform"
                  >
                    Ver el menú
                  </button>
                </div>
              ) : (
                misPedidos.map((p) => {
                  const paso = FLUJO_ESTADOS.indexOf(p.estado);
                  const activo = paso >= 0 && p.estado !== 'Entregado';
                  return (
                    <div
                      key={p.idPedido}
                      className={`bg-white rounded-2xl p-4 shadow-sm border ${
                        activo ? 'border-marron' : 'border-neutral-100'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-neutral-600 font-mono">{p.idPedido}</p>
                          <p className="text-sm text-neutral-700">
                            {fechaBonita(p.fecha)} · {p.hora}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${colorEstadoCliente(p.estado)}`}
                        >
                          {p.estado}
                        </span>
                      </div>

                      {/* Avance del pedido */}
                      {paso >= 0 && p.estado !== 'Cancelado' && (
                        <div className="flex gap-1 mt-3">
                          {FLUJO_ESTADOS.map((_, i) => (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full ${
                                i <= paso ? 'bg-marron' : 'bg-neutral-200'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      <div className="mt-3 space-y-1">
                        {p.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-neutral-700">
                              {item.cantidad}× {item.nombre}
                            </span>
                            <span className="text-neutral-700">${item.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Lo que escribio al pedir. Vivia solo en la hoja:
                          quien pidio "sin granola" no podia comprobarlo. */}
                      {p.notas?.trim() && (
                        <p className="mt-2 text-xs text-neutral-700 bg-neutral-50 rounded-lg px-3 py-2">
                          📝 {p.notas.trim()}
                        </p>
                      )}

                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-neutral-100">
                        <div>
                          <span className="font-bold text-black">${p.total.toFixed(2)}</span>
                          {p.estadoPago === 'Pagado' && (
                            <span className="ml-2 text-xs font-semibold text-green-600">✅ Pagado</span>
                          )}
                          {p.estadoPago === 'Pendiente' && p.estado !== 'Cancelado' && (
                            <span className="ml-2 text-xs font-semibold text-amber-600">🕓 Pago pendiente</span>
                          )}
                        </div>
                        {p.items.length > 0 && (
                          <button
                            onClick={() => setConfirmarRepetir(p)}
                            className="bg-marron text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform"
                          >
                            🔁 Volver a pedir
                          </button>
                        )}
                      </div>

                      {/* Ya llegué por mi pedido — mientras siga en curso */}
                      {p.estadoPago === 'Pagado' &&
                        FLUJO_ESTADOS.indexOf(p.estado) >= 0 &&
                        p.estado !== 'Entregado' && (
                          <div className="mt-3">
                            {avisando === p.idPedido ? (
                              <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                                <p className="text-sm font-bold text-neutral-900">
                                  ¿Quieres decirnos algo más?
                                </p>
                                <input
                                  value={notaLlegada}
                                  onChange={(e) => setNotaLlegada(e.target.value)}
                                  maxLength={140}
                                  placeholder="Ej. Estoy en el carro blanco (opcional)"
                                  className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                                />
                                <div className="flex gap-2 text-neutral-900">
                                  <button
                                    onClick={() => {
                                      setAvisando(null);
                                      setNotaLlegada('');
                                    }}
                                    className="flex-1 bg-white border border-neutral-200 text-neutral-600 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => avisarLlegada(p)}
                                    disabled={enviandoAviso}
                                    className="flex-[2] bg-green-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                                  >
                                    {enviandoAviso ? 'Avisando…' : 'Avisar que ya llegué'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setAvisando(p.idPedido);
                                    setNotaLlegada('');
                                  }}
                                  className="w-full bg-green-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform"
                                >
                                  🚗 Ya estoy afuera
                                </button>
                                {(avisoEnviado === p.idPedido || p.avisoLlegada) && (
                                  <p className="mt-1.5 text-xs text-center text-green-700">
                                    ✅ Ya les avisamos, van para allá
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}

                      {/* Tu opinión nos interesa — solo si ya lo recibió */}
                      {p.estado === 'Entregado' && !p.yaOpino && opinando !== p.idPedido && (
                        <button
                          onClick={() => abrirOpinion(p.idPedido)}
                          className="mt-3 w-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                        >
                          ⭐ Tu opinión nos interesa
                        </button>
                      )}
                      {p.estado === 'Entregado' && p.yaOpino && (
                        <p className="mt-3 text-xs text-center text-neutral-600">
                          {graciasOpinion === p.idPedido
                            ? '💛 ¡Gracias por tu opinión!'
                            : '✅ Ya calificaste este pedido'}
                        </p>
                      )}

                      {opinando === p.idPedido && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                          <p className="text-sm font-bold text-neutral-900">¿Cómo estuvo tu pedido?</p>

                          {[
                            { etiqueta: 'Sabor', valor: sabor, set: setSabor },
                            { etiqueta: 'Calidad', valor: calidad, set: setCalidad },
                          ].map((fila) => (
                            <div key={fila.etiqueta} className="flex items-center justify-between">
                              <span className="text-sm text-neutral-700">{fila.etiqueta}</span>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    onClick={() => fila.set(n)}
                                    className="text-2xl leading-none active:scale-90 transition-transform"
                                    aria-label={`${fila.etiqueta} ${n} de 5`}
                                  >
                                    {n <= fila.valor ? '⭐' : '☆'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          <textarea
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                            rows={2}
                            placeholder="¿Algo que quieras contarnos? (opcional)"
                            className="w-full bg-white border border-amber-200 rounded-xl p-2.5 text-sm text-neutral-900 placeholder-neutral-600 focus:outline-none focus:border-marron resize-none"
                          />

                          <label className="flex items-center gap-2 text-xs text-neutral-600 text-neutral-900">
                            <input
                              type="checkbox"
                              checked={opinionAnonima}
                              onChange={(e) => setOpinionAnonima(e.target.checked)}
                              className="w-4 h-4 accent-black text-neutral-900"
                            />
                            Enviar sin mi nombre
                          </label>

                          <div className="flex gap-2">
                            <button
                              onClick={() => setOpinando(null)}
                              className="flex-1 text-sm font-semibold text-neutral-600 bg-white border border-neutral-200 py-2.5 rounded-xl active:scale-95 transition-transform"
                            >
                              Ahora no
                            </button>
                            <button
                              onClick={() => enviarOpinion(p.idPedido)}
                              disabled={sabor === 0 || calidad === 0 || enviandoOpinion}
                              className="flex-1 bg-marron text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                            >
                              {enviandoOpinion ? 'Enviando...' : 'Enviar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pago pendiente: liquidarlo */}
                      {p.estadoPago === 'Pendiente' && p.estado !== 'Cancelado' && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <p className="text-xs text-amber-800 mb-2">
                            Este pedido quedó <b>sin pagar</b>. Puedes completarlo ahora.
                          </p>
                          <button
                            onClick={() => pagarPendiente(p.idPedido)}
                            disabled={accionPedido === p.idPedido}
                            className="w-full bg-marron text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {accionPedido === p.idPedido ? 'Abriendo...' : '💳 Pagar ahora'}
                          </button>
                        </div>
                      )}

                      {/* Acciones generales del pedido */}
                      {p.estado !== 'Cancelado' && (
                        <div className="mt-3 flex flex-col gap-2">
                          <a
                            href={linkWhatsApp(
                              TELEFONO_NEGOCIO,
                              `¡Hola Moramango! 🥭 Tengo una duda sobre mi pedido ${p.idPedido}.`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full text-center border border-green-600 text-green-700 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform"
                          >
                            💬 Contáctanos por WhatsApp
                          </a>
                          {/* Solo se puede cancelar si sigue en Recibido y sin pagar:
                              ya pagado o en preparación, se contacta al negocio */}
                          {p.estado === 'Recibido' && p.estadoPago !== 'Pagado' && (
                            <button
                              onClick={() => cancelarMiPedido(p.idPedido)}
                              disabled={accionPedido === p.idPedido}
                              className="w-full border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                            >
                              {accionPedido === p.idPedido ? 'Cancelando…' : 'Cancelar pedido'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* PANTALLA 3: PERFIL */}
        {verPerfil && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button onClick={() => setVerPerfil(false)} className="w-10 h-10 flex items-center justify-center bg-marron/15 text-marron rounded-full font-bold text-2xl leading-none active:scale-90 mr-3">←</button>
              <h2 className="text-xl font-bold text-black">Mis Datos</h2>
            </header>

            <form onSubmit={guardarPerfil} className="flex-1 p-6 space-y-6 overflow-y-auto">
              {session && (
                <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-neutral-100">
                  <span className="text-2xl">👤</span>
                  <div>
                    <p className="font-semibold text-neutral-900">{session.user?.name}</p>
                    <p className="text-xs text-neutral-700">{session.user?.email}</p>
                  </div>
                </div>
              )}

              {/* Historial de pedidos, ahora desde el perfil (antes era un
                  icono en el encabezado) */}
              {session && (
                <button
                  type="button"
                  onClick={() => {
                    setVerPerfil(false);
                    setVerMisPedidos(true);
                  }}
                  className="w-full flex items-center gap-3 bg-white p-4 rounded-2xl border border-neutral-100 active:scale-95 transition-transform text-left"
                >
                  <span className="text-2xl">🧾</span>
                  <div className="flex-1">
                    <p className="font-semibold text-neutral-900">Mis pedidos</p>
                    <p className="text-xs text-neutral-700">Ve el historial y estado de tus pedidos</p>
                  </div>
                  <span className="text-neutral-400 text-xl">›</span>
                </button>
              )}

              {/* Tarjeta de cliente: su código para acumular lealtad al
                  comprar en el local, más su avance */}
              {session && (session.user as any)?.id_usuario && (
                <div className="bg-gradient-to-br from-marron-oscuro to-marron rounded-2xl p-5 text-white shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">
                        Cliente Moramango
                      </p>
                      <p className="font-bold text-lg leading-tight mt-0.5">{session.user?.name}</p>
                    </div>
                    <span className="text-2xl">🥭</span>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">
                      Tu código
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="font-mono font-bold text-2xl tracking-widest">
                        {(session.user as any).id_usuario}
                      </span>
                      <button
                        type="button"
                        onClick={copiarCodigo}
                        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                          codigoCopiado ? 'bg-green-500 text-white' : 'bg-white/15 text-white'
                        }`}
                      >
                        {codigoCopiado ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </div>

                  {/* Avance de lealtad */}
                  {lealtad && (
                    <div className="mt-4 pt-4 border-t border-white/15">
                      {lealtad.beneficioDisponible !== 'Ninguno' ? (
                        <p className="text-sm font-bold text-amber-300">
                          🎁 Tienes disponible:{' '}
                          {esReactivacion(lealtad.beneficioDisponible)
                            ? `$${montoReactivacion(lealtad.beneficioDisponible)} de descuento`
                            : lealtad.beneficioDisponible}
                        </p>
                      ) : (
                        <>
                          <div className="flex justify-between text-xs text-white/70 mb-1.5">
                            <span>{lealtad.cicloActual} de 5 pedidos</span>
                            <span>
                              {lealtad.pedidosParaDescuento > 0
                                ? `Faltan ${lealtad.pedidosParaDescuento} para tu 15%`
                                : '¡Ya casi!'}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <div
                                key={n}
                                className={`h-1.5 flex-1 rounded-full ${
                                  n <= lealtad.cicloActual ? 'bg-amber-400' : 'bg-white/20'
                                }`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-white/50 mt-4 leading-relaxed">
                    Muestra este código al comprar en el local para que tus pedidos también sumen.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Nombre Completo</label>
                <input type="text" value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)}
                  placeholder="Ej. Laura Edith"
                  className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-marron transition-colors shadow-sm" required />
              </div>

              <div className="space-y-2 text-neutral-900">
                <label className="text-sm font-semibold text-neutral-700 block text-neutral-900">Teléfono de Contacto</label>
                <div className="flex gap-2 text-neutral-900">
                  <div className="relative w-24 shrink-0 text-neutral-900">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-700 pointer-events-none">+</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={ladaUsuario}
                      onChange={(e) => setLadaUsuario(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      placeholder="52"
                      maxLength={3}
                      className="w-full bg-white border border-neutral-300 rounded-xl pl-7 pr-2 py-3 text-neutral-900 focus:outline-none focus:border-marron transition-colors shadow-sm"
                      required
                    />
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={telefonoUsuario}
                    onChange={(e) => setTelefonoUsuario(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    placeholder={ladaUsuario === '52' ? '8186003207 (10 dígitos)' : 'Número sin lada'}
                    className="flex-1 bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-marron transition-colors shadow-sm"
                    required
                  />
                </div>
                {errorTelefono && (
                  <p className="text-xs text-red-600 mt-1">{errorTelefono}</p>
                )}
                <p className="text-xs text-neutral-700">
                  {ladaUsuario === '52'
                    ? 'México (+52): 10 dígitos'
                    : `Lada +${ladaUsuario}: entre 7 y 15 dígitos`}
                </p>
              </div>

              <button type="submit" className="w-full bg-marron text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md mt-8">
                Guardar Datos
              </button>
            </form>

            {session && (
              <div className="p-6 pt-0 shrink-0">
                <button
                  onClick={() => {
                    if (confirm('¿Cerrar sesión? Tu carrito se conserva.')) {
                      signOut({ callbackUrl: '/' });
                    }
                  }}
                  className="w-full bg-white border border-red-200 text-red-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        )}

        {/* MODAL: DETALLE DE PRODUCTO (bottom sheet) */}
        {productoDetalle && (
          <div
            className="absolute inset-0 z-[60] flex items-end justify-center"
            onClick={() => setProductoDetalle(null)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Sheet */}
            <div
              className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[90%] flex flex-col animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <style jsx>{`
                @keyframes slide-up {
                  from { transform: translateY(100%); }
                  to { transform: translateY(0); }
                }
                .animate-slide-up {
                  animation: slide-up 0.25s ease-out;
                }
              `}</style>

              {/* Handle visual */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-neutral-300 rounded-full" />
              </div>

              {/* Botón cerrar */}
              <button
                onClick={() => setProductoDetalle(null)}
                // Ahora queda encima de la foto: fondo sólido y sombra para
                // que se distinga sea cual sea la imagen de atrás
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white shadow-md rounded-full text-neutral-900 font-bold active:scale-90 z-20"
                aria-label="Cerrar"
              >
                ✕
              </button>

              {/* Contenido scrollable */}
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                {/*
                  La foto, de lado a lado y alta.
                  
                  Antes vivía en una caja de 160 px con aire a los lados: una
                  foto vertical se encogía hasta caber en esos 160 px y
                  acababa ocupando como un tercio del espacio. La foto es lo
                  que vende el producto, así que se le da el ancho completo
                  de la hoja (el -mx-6 se sale del margen del texto) y casi
                  el doble de alto.
                */}
                <div className="relative -mx-6 h-64 sm:h-72 bg-neutral-100 overflow-hidden flex items-center justify-center mb-4 mt-2">
                  <FotoProducto
                    key={productoDetalle.imagen}
                    src={productoDetalle.imagen}
                    alt={productoDetalle.nombre}
                    conFondo
                    className="relative w-full h-full object-contain"
                    respaldo={
                      <span
                        className={productoDetalle.emoji ? 'text-7xl' : 'text-7xl opacity-20'}
                      >
                        {iconoProducto(productoDetalle)}
                      </span>
                    }
                  />
                </div>

                {/* Categoría */}
                {productoDetalle.categoria && (
                  <p className="text-xs text-neutral-700 uppercase tracking-wide font-semibold mb-1">
                    {productoDetalle.categoria}
                  </p>
                )}

                {/* Nombre */}
                <h2 className="text-2xl font-bold text-neutral-900 mb-3 leading-tight">
                  {productoDetalle.nombre}
                </h2>

                {/* Descripción completa */}
                {productoDetalle.descripcion && (
                  <p className="text-sm text-neutral-600 leading-relaxed mb-4 whitespace-pre-line">
                    {productoDetalle.descripcion}
                  </p>
                )}

                {/* Opciones a elegir: queso del combo, sabor de la bebida…
                    Ya contestada, la lista se recoge en un renglón: el
                    Combo 1 muestra 8 bebidas y llenaba toda la pantalla. */}
                {gruposDetalle.map((g) => {
                  const elegido = opcionesElegidas[g.nombre];
                  const abierto = !elegido || grupoAbierto === g.nombre;

                  if (!abierto) {
                    return (
                      <button
                        key={g.nombre}
                        onClick={() => setGrupoAbierto(g.nombre)}
                        className="w-full mb-3 flex items-center justify-between gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-3 text-left active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs text-neutral-700 font-medium">
                            {g.nombre}
                          </span>
                          <span className="block font-bold text-neutral-900 truncate">
                            ✓ {elegido}
                          </span>
                        </span>
                        <span className="text-sm font-bold text-marron shrink-0">Cambiar</span>
                      </button>
                    );
                  }

                  return (
                    <div key={g.nombre} className="mb-4">
                      <p className="text-sm font-semibold text-neutral-800 mb-2">
                        Elige {g.nombre.toLowerCase()}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {g.opciones.map((o) => {
                          const activo = elegido === o;
                          const agotada = agotadasDetalle.includes(o);
                          return (
                            <button
                              key={o}
                              disabled={agotada}
                              onClick={() => {
                                setOpcionesElegidas((prev) => ({ ...prev, [g.nombre]: o }));
                                setGrupoAbierto(null);
                              }}
                              className={`px-3.5 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${
                                agotada
                                  ? 'border-neutral-200 bg-neutral-100 text-neutral-500 line-through'
                                  : activo
                                  ? 'border-marron bg-marron/10 text-neutral-900'
                                  : 'border-neutral-200 bg-white text-neutral-800'
                              }`}
                            >
                              {o}
                              {agotada && (
                                <span className="block text-[10px] font-bold no-underline">
                                  hoy no hay
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Toppings: se pueden marcar varios o ninguno */}
                {extrasDetalle.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-neutral-800 mb-2">
                      ¿Le agregamos algo? <span className="font-normal text-neutral-600">(opcional)</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {extrasDetalle.map((e) => {
                        const activo = extrasElegidos.some((x) => x.nombre === e.nombre);
                        return (
                          <button
                            key={e.nombre}
                            onClick={() =>
                              setExtrasElegidos((prev) =>
                                activo
                                  ? prev.filter((x) => x.nombre !== e.nombre)
                                  : [...prev, e]
                              )
                            }
                            className={`px-3.5 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${
                              activo
                                ? 'border-marron bg-marron/10 text-neutral-900'
                                : 'border-neutral-200 bg-white text-neutral-800'
                            }`}
                          >
                            {activo ? '✓ ' : '+ '}
                            {e.nombre}
                            <span className="font-bold"> ${e.precio.toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tamaño: solo si el producto se vende en varios */}
                {tamanosDetalle.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-neutral-800 mb-2">Elige el tamaño</p>
                    <div className="flex flex-wrap gap-2">
                      {tamanosDetalle.map((t) => {
                        const activo = t.nombre === tamanoElegido;
                        return (
                          <button
                            key={t.nombre}
                            onClick={() => setTamanoElegido(t.nombre)}
                            className={`px-4 py-2.5 rounded-xl border-2 text-left transition-colors ${
                              activo
                                ? 'border-marron bg-marron/10'
                                : 'border-neutral-200 bg-white'
                            }`}
                          >
                            <span className="block text-sm font-bold text-neutral-900">
                              {t.nombre}
                            </span>
                            <span className="block text-xs font-semibold text-neutral-700">
                              ${t.precio.toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Precio */}
                <div className="text-2xl font-bold text-neutral-900 mb-2">
                  ${precioDetalle.toFixed(2)}
                </div>
              </div>

              {/* Footer con acción */}
              <div className="border-t border-neutral-100 p-4 shrink-0 bg-white rounded-b-3xl">
                {cantidadEnCarritoDetalle === 0 ? (
                  <button
                    onClick={() =>
                      agregarAlCarrito(
                        productoDetalle,
                        tamanoElegido,
                        opcionesElegidas,
                        extrasElegidos
                      )
                    }
                    disabled={faltanPorElegir.length > 0}
                    className="w-full bg-marron text-white font-bold text-base py-4 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-50 disabled:active:scale-100"
                  >
                    {faltanPorElegir.length > 0
                      ? `Elige ${enumerar(faltanPorElegir)} para continuar`
                      : `Agregar al pedido${[
                          tamanoElegido,
                          resumenEleccion(gruposDetalle, opcionesElegidas),
                          resumenExtras(extrasElegidos),
                        ]
                          .filter(Boolean)
                          .map((t) => ` · ${t}`)
                          .join('')}`}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center bg-neutral-100 rounded-2xl p-1.5 gap-2">
                      <button
                        onClick={() => eliminarDelCarrito(claveDetalle)}
                        className="w-11 h-11 flex items-center justify-center bg-white rounded-xl font-medium text-neutral-700 shadow-sm active:scale-90 text-lg"
                      >
                        −
                      </button>
                      <span className="font-bold text-neutral-900 px-2 min-w-[24px] text-center text-lg tabular-nums">
                        {cantidadEnCarritoDetalle}
                      </span>
                      <button
                        onClick={() =>
                          agregarAlCarrito(
                            productoDetalle,
                            tamanoElegido,
                            opcionesElegidas,
                            extrasElegidos
                          )
                        }
                        disabled={faltanPorElegir.length > 0}
                        className="disabled:opacity-50 w-11 h-11 flex items-center justify-center bg-marron text-white rounded-xl font-medium shadow-sm active:scale-90 text-lg"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-700">En tu pedido</p>
                      <p className="font-bold text-neutral-900">
                        ${(precioDetalle * cantidadEnCarritoDetalle).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
