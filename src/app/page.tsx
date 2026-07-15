'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';

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

interface ItemCarrito {
  id: string;
  nombre: string;
  precio: number;
  categoria: string;
  cantidad: number;
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
  total: number;
  yaOpino: boolean;
  items: { idProducto: string; nombre: string; cantidad: number; subtotal: number }[];
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

// Datos de la cuenta para pago por transferencia (SPEI).
// Se configuran con variables de entorno NEXT_PUBLIC_* (en .env.local y
// Vercel) para no dejar los datos bancarios dentro del código/GitHub.
// Si no hay CLABE configurada, la opción de transferencia no aparece.
const TRANSFERENCIA = {
  clabe: process.env.NEXT_PUBLIC_TRANSFER_CLABE || '',
  titular: process.env.NEXT_PUBLIC_TRANSFER_TITULAR || '',
  banco: process.env.NEXT_PUBLIC_TRANSFER_BANCO || '',
};
const TRANSFERENCIA_HABILITADA = TRANSFERENCIA.clabe.length > 0;

export default function Home() {
  const { data: session } = useSession();
  const [productos, setProductos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [verPerfil, setVerPerfil] = useState(false);
  const [verMisPedidos, setVerMisPedidos] = useState(false);
  const [misPedidos, setMisPedidos] = useState<MiPedido[]>([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);
  const [avisoRepetir, setAvisoRepetir] = useState('');
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
  const [codigoCopiado, setCodigoCopiado] = useState(false);
  const [avisoPago, setAvisoPago] = useState('');
  const [notas, setNotas] = useState('');
  const [lealtad, setLealtad] = useState<DatosLealtad | null>(null);
  const [cargandoLealtad, setCargandoLealtad] = useState(false);
  const [beneficioAplicado, setBeneficioAplicado] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/productos')
      .then((res) => res.json())
      .then((data) => {
        if (data.productos) setProductos(data.productos);
        setCargando(false);
      })
      .catch(() => setCargando(false));

    try {
      const carritoGuardado = localStorage.getItem(CARRITO_KEY);
      if (carritoGuardado) setCarrito(JSON.parse(carritoGuardado));
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

  const getIcono = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes('jugo')) return '🥤';
    if (c.includes('licuado')) return '🥛';
    if (c.includes('salada') || c.includes('sándwich')) return '🥪';
    if (c.includes('dulce') || c.includes('postre')) return '🥐';
    return '🍽️';
  };

  const limpiarPrecio = (precio: any): number => {
    const num = parseFloat(precio?.toString().replace(',', '.'));
    return isNaN(num) ? 0 : num;
  };

  const agregarAlCarrito = (producto: any) => {
    setCarrito(prev => {
      const existe = prev.find(item => item.id === producto.id);
      if (existe) {
        return prev.map(item =>
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [...prev, {
        id: producto.id,
        nombre: producto.nombre,
        precio: limpiarPrecio(producto.precio),
        categoria: producto.categoria,
        cantidad: 1
      }];
    });
  };

  const eliminarDelCarrito = (idProducto: string) => {
    setCarrito(prev => {
      const item = prev.find(i => i.id === idProducto);
      if (!item) return prev;
      if (item.cantidad > 1) {
        return prev.map(i => i.id === idProducto ? { ...i, cantidad: i.cantidad - 1 } : i);
      }
      const nuevo = prev.filter(i => i.id !== idProducto);
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

    localStorage.setItem('moramango_nombre', nombreUsuario);
    localStorage.setItem('moramango_telefono', telefonoCompleto);

    if (session) {
      try {
        await fetch('/api/usuario', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombreUsuario,
            telefono: telefonoCompleto,
          }),
        });
      } catch {
        // Si falla el sync, ya está en localStorage. No bloqueamos al usuario.
      }
    }

    setVerPerfil(false);
  };

  // Abrir detalle solo si hay descripción — evita modal vacío
  const abrirDetalle = (producto: any) => {
    if (producto.descripcion && producto.descripcion.trim()) {
      setProductoDetalle(producto);
    }
  };

  const totalArticulos = carrito.reduce((total, item) => total + item.cantidad, 0);
  const totalBruto = carrito.reduce((total, item) => total + (item.precio * item.cantidad), 0);

  const descuentoAplicado = (() => {
    if (!beneficioAplicado || !lealtad) return 0;
    if (lealtad.beneficioDisponible === '15% Descuento') return totalBruto * 0.15;
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
  const volverAPedir = (pedido: MiPedido) => {
    const disponibles: ItemCarrito[] = [];
    const noDisponibles: string[] = [];

    for (const item of pedido.items) {
      const actual = productos.find((p) => p.id === item.idProducto);
      if (!actual) {
        noDisponibles.push(item.nombre);
        continue;
      }
      disponibles.push({
        id: actual.id,
        nombre: actual.nombre,
        precio: limpiarPrecio(actual.precio),
        categoria: actual.categoria,
        cantidad: item.cantidad,
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

  const confirmarOrden = async () => {
    if (carrito.length === 0) return;

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
          })),
          notas: notas.trim(),
          horaRecoleccion: '',
          beneficioCanjeado: beneficioCanjeadoStr,
          pagoEnLinea: formaPago === 'linea',
          metodoPago: formaPago === 'transferencia' ? 'Transferencia' : '',
        }),
      });

      const data = await res.json();

      if (data.success) {
        const fueTransferencia = formaPago === 'transferencia';
        setCarrito([]);
        localStorage.removeItem(CARRITO_KEY);
        setVerCarrito(false);
        setNotas('');
        setBeneficioAplicado(false);
        setLealtad(null);
        setFormaPago('recoger');

        if (data.checkoutUrl) {
          // Ir al checkout de Mercado Pago; al terminar regresa con ?pago=...
          window.location.href = data.checkoutUrl;
          return;
        }

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
          <p className="text-neutral-500 mb-2">Tu número de pedido es:</p>
          <p className="text-lg font-mono font-bold text-black bg-neutral-100 px-4 py-2 rounded-xl mb-6">
            {pedidoConfirmado}
          </p>
          {pedidoPorTransferencia && TRANSFERENCIA_HABILITADA && (
            <div className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 mb-6 text-left">
              <p className="text-sm font-semibold text-black mb-2">📲 Falta tu transferencia</p>
              <p className="text-xs text-neutral-600 mb-2">
                Transfiere el total a la CLABE y muestra tu comprobante al recoger:
              </p>
              <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-neutral-200 p-2.5">
                <span className="font-mono font-bold text-black text-sm break-all">{TRANSFERENCIA.clabe}</span>
                <button
                  onClick={copiarClabe}
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    clabeCopiada ? 'bg-green-600 text-white' : 'bg-marron text-white'
                  }`}
                >
                  {clabeCopiada ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
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
  const itemEnCarritoDetalle = productoDetalle
    ? carrito.find(i => i.id === productoDetalle.id)
    : null;
  const cantidadEnCarritoDetalle = itemEnCarritoDetalle?.cantidad ?? 0;

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
                  <p className="text-xs text-neutral-500 font-medium mt-1">Blend to Go</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session && (
                  <button
                    onClick={() => setVerMisPedidos(true)}
                    className="w-10 h-10 rounded-full bg-neutral-100 text-black flex items-center justify-center text-lg active:scale-90 transition-transform"
                    title="Mis pedidos"
                  >
                    🧾
                  </button>
                )}
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

            <div className="flex overflow-x-auto gap-4 mt-6 px-4 pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                  <span className={`text-xs capitalize ${categoriaActiva === cat ? 'font-bold text-black' : 'font-medium text-neutral-500'}`}>
                    {cat}
                  </span>
                </button>
              ))}
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
                <p className="text-neutral-500 animate-pulse font-medium">Preparando menú...</p>
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
                          const itemEnCarrito = carrito.find(item => item.id === producto.id);
                          const cantidadAgregada = itemEnCarrito ? itemEnCarrito.cantidad : 0;
                          const tieneDescripcion = producto.descripcion && producto.descripcion.trim();

                          return (
                            <div key={producto.id || index} className="flex gap-4 p-4 rounded-3xl bg-white shadow-sm border border-neutral-100">
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
                                    <span className="text-neutral-400 text-xs">›</span>
                                  )}
                                </div>
                                {producto.descripcion && (
                                  <p className="text-xs text-neutral-500 mt-1.5 line-clamp-2 leading-relaxed">
                                    {producto.descripcion}
                                  </p>
                                )}
                                <div className="mt-3 font-bold text-neutral-900">${producto.precio}</div>
                              </button>

                              <div className="relative shrink-0 ml-2">
                                <button
                                  onClick={() => agregarAlCarrito(producto)}
                                  className="w-28 h-28 bg-neutral-100 rounded-2xl overflow-hidden flex items-center justify-center active:scale-95 transition-transform"
                                  aria-label={`Agregar ${producto.nombre}`}
                                >
                                  {producto.imagen ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-5xl opacity-20">{getIcono(categoria)}</span>
                                  )}
                                </button>

                                {/* Indicador + para agregar (solo si no está en el carrito) */}
                                {cantidadAgregada === 0 && (
                                  <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-marron text-white rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                                    <span className="text-xl font-medium leading-none">+</span>
                                  </div>
                                )}
                                
                                {cantidadAgregada > 0 && (
                                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-white/90 backdrop-blur-sm rounded-b-2xl px-1.5 py-1 shadow-sm">
                                    <button
                                      onClick={() => eliminarDelCarrito(producto.id)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-neutral-100 active:scale-90 transition-transform text-neutral-700"
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
              <button onClick={() => setVerCarrito(false)} className="w-10 h-10 flex items-center justify-center bg-neutral-100 rounded-full font-bold active:scale-90 mr-3">←</button>
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
                <div key={item.id} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-neutral-100">
                  <div className="pr-4 flex-1">
                    <h3 className="font-semibold text-neutral-900 leading-tight">{item.nombre}</h3>
                    <p className="text-neutral-500 font-medium text-sm mt-1">${(item.precio * item.cantidad).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center bg-neutral-100 rounded-xl p-1 gap-2 shrink-0">
                    <button onClick={() => eliminarDelCarrito(item.id)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-medium text-neutral-700 shadow-sm active:scale-90">-</button>
                    <span className="font-bold text-neutral-900 px-1 min-w-[16px] text-center">{item.cantidad}</span>
                    <button onClick={() => agregarAlCarrito(item)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-medium text-neutral-700 shadow-sm active:scale-90">+</button>
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
                            {beneficioAplicado ? '✓ Descuento aplicado' : 'Aplicar 15% de descuento'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white rounded-2xl p-4 border border-neutral-100 shadow-sm">
                <label className="text-sm font-semibold text-neutral-700 block mb-2">Notas del pedido</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej: Sin mayonesa, sin tomate, extra salsa..."
                  rows={3}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-marron transition-colors resize-none"
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border-t border-neutral-100 shrink-0">
              {beneficioAplicado && descuentoAplicado > 0 && (
                <div className="mb-3 space-y-1">
                  <div className="flex justify-between items-center text-sm text-neutral-500">
                    <span>Subtotal</span>
                    <span>${totalBruto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                    <span>Descuento 15%</span>
                    <span>-${descuentoAplicado.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mb-4">
                <span className="text-neutral-500 font-medium text-lg">Total a pagar</span>
                <span className="text-2xl font-bold text-black">${totalPagar.toFixed(2)}</span>
              </div>

              {session && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-neutral-500 mb-2">¿Cómo quieres pagar?</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setFormaPago('recoger')}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        formaPago === 'recoger' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      🏪 Pagar al recoger
                    </button>
                    {TRANSFERENCIA_HABILITADA && (
                      <button
                        onClick={() => setFormaPago('transferencia')}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                          formaPago === 'transferencia' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        📲 Transferencia
                      </button>
                    )}
                    <button
                      onClick={() => setFormaPago('linea')}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        formaPago === 'linea' ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      💳 Pagar en línea (tarjeta)
                    </button>
                  </div>

                  {formaPago === 'linea' && (
                    <p className="text-xs text-neutral-500 mt-2">
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
                          <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-semibold">CLABE</p>
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
                            <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-semibold">Titular</p>
                            <p className="text-sm text-neutral-800">{TRANSFERENCIA.titular}</p>
                          </div>
                        )}
                        {TRANSFERENCIA.banco && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-semibold">Banco</p>
                            <p className="text-sm text-neutral-800">{TRANSFERENCIA.banco}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
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

              <button
                onClick={confirmarOrden}
                disabled={enviando}
                className="w-full bg-marron text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
              >
                {enviando ? 'Enviando...' : session ? 'Confirmar Orden' : 'Iniciar sesión para pedir'}
              </button>
            </div>
          </div>
        )}

        {/* PANTALLA 4: MIS PEDIDOS */}
        {verMisPedidos && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button
                onClick={() => setVerMisPedidos(false)}
                className="w-10 h-10 flex items-center justify-center bg-neutral-100 rounded-full font-bold active:scale-90 mr-3"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-black">Mis pedidos</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cargandoPedidos ? (
                <p className="text-neutral-500 animate-pulse text-center py-8">Cargando tus pedidos...</p>
              ) : misPedidos.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-3">🧾</div>
                  <p className="text-neutral-500">Todavía no has hecho ningún pedido.</p>
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
                          <p className="text-xs text-neutral-400 font-mono">{p.idPedido}</p>
                          <p className="text-sm text-neutral-500">
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
                            <span className="text-neutral-500">${item.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

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
                            onClick={() => volverAPedir(p)}
                            className="bg-marron text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform"
                          >
                            🔁 Volver a pedir
                          </button>
                        )}
                      </div>

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
                        <p className="mt-3 text-xs text-center text-neutral-400">
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
                            className="w-full bg-white border border-amber-200 rounded-xl p-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-marron resize-none"
                          />

                          <label className="flex items-center gap-2 text-xs text-neutral-600">
                            <input
                              type="checkbox"
                              checked={opinionAnonima}
                              onChange={(e) => setOpinionAnonima(e.target.checked)}
                              className="w-4 h-4 accent-black"
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

                      {/* Pago pendiente: liquidarlo o cancelar */}
                      {p.estadoPago === 'Pendiente' && p.estado !== 'Cancelado' && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <p className="text-xs text-amber-800 mb-2">
                            Este pedido quedó <b>sin pagar</b>. Puedes completarlo ahora o cancelarlo.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => pagarPendiente(p.idPedido)}
                              disabled={accionPedido === p.idPedido}
                              className="flex-1 bg-marron text-white text-sm font-bold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                            >
                              {accionPedido === p.idPedido ? 'Abriendo...' : '💳 Pagar ahora'}
                            </button>
                            {p.estado === 'Recibido' && (
                              <button
                                onClick={() => cancelarMiPedido(p.idPedido)}
                                disabled={accionPedido === p.idPedido}
                                className="flex-1 border border-red-200 text-red-600 text-sm font-semibold py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
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
              <button onClick={() => setVerPerfil(false)} className="w-10 h-10 flex items-center justify-center bg-neutral-100 rounded-full font-bold active:scale-90 mr-3">←</button>
              <h2 className="text-xl font-bold text-black">Mis Datos</h2>
            </header>

            <form onSubmit={guardarPerfil} className="flex-1 p-6 space-y-6 overflow-y-auto">
              {session && (
                <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-neutral-100">
                  <span className="text-2xl">👤</span>
                  <div>
                    <p className="font-semibold text-neutral-900">{session.user?.name}</p>
                    <p className="text-xs text-neutral-500">{session.user?.email}</p>
                  </div>
                </div>
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
                          🎁 Tienes disponible: {lealtad.beneficioDisponible}
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

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Teléfono de Contacto</label>
                <div className="flex gap-2">
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">+</span>
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
                <p className="text-xs text-neutral-500">
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
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-neutral-100 rounded-full text-neutral-700 active:scale-90 z-10"
                aria-label="Cerrar"
              >
                ✕
              </button>

              {/* Contenido scrollable */}
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                {/* Imagen grande */}
                <div className="w-full h-48 bg-neutral-100 rounded-2xl overflow-hidden flex items-center justify-center mb-4 mt-2">
                  {productoDetalle.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={productoDetalle.imagen}
                      alt={productoDetalle.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-7xl opacity-20">
                      {getIcono(productoDetalle.categoria || '')}
                    </span>
                  )}
                </div>

                {/* Categoría */}
                {productoDetalle.categoria && (
                  <p className="text-xs text-neutral-500 uppercase tracking-wide font-semibold mb-1">
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

                {/* Precio */}
                <div className="text-2xl font-bold text-neutral-900 mb-2">
                  ${productoDetalle.precio}
                </div>
              </div>

              {/* Footer con acción */}
              <div className="border-t border-neutral-100 p-4 shrink-0 bg-white rounded-b-3xl">
                {cantidadEnCarritoDetalle === 0 ? (
                  <button
                    onClick={() => agregarAlCarrito(productoDetalle)}
                    className="w-full bg-marron text-white font-bold text-base py-4 rounded-2xl active:scale-95 transition-transform shadow-md"
                  >
                    Agregar al pedido
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center bg-neutral-100 rounded-2xl p-1.5 gap-2">
                      <button
                        onClick={() => eliminarDelCarrito(productoDetalle.id)}
                        className="w-11 h-11 flex items-center justify-center bg-white rounded-xl font-medium text-neutral-700 shadow-sm active:scale-90 text-lg"
                      >
                        −
                      </button>
                      <span className="font-bold text-neutral-900 px-2 min-w-[24px] text-center text-lg tabular-nums">
                        {cantidadEnCarritoDetalle}
                      </span>
                      <button
                        onClick={() => agregarAlCarrito(productoDetalle)}
                        className="w-11 h-11 flex items-center justify-center bg-marron text-white rounded-xl font-medium shadow-sm active:scale-90 text-lg"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-500">En tu pedido</p>
                      <p className="font-bold text-neutral-900">
                        ${(limpiarPrecio(productoDetalle.precio) * cantidadEnCarritoDetalle).toFixed(2)}
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
