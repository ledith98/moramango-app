'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

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

const CARRITO_KEY = 'moramango_carrito';

export default function Home() {
  const { data: session } = useSession();
  const [productos, setProductos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const [verPerfil, setVerPerfil] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [telefonoUsuario, setTelefonoUsuario] = useState('');
  const [pedidoConfirmado, setPedidoConfirmado] = useState<string | null>(null);
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
    setTelefonoUsuario(localStorage.getItem('moramango_telefono') || '');
  }, []);

  useEffect(() => {
    if (session && verCarrito && !lealtad) {
      setCargandoLealtad(true);
      fetch('/api/usuario')
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) setLealtad(data);
        })
        .catch(() => {})
        .finally(() => setCargandoLealtad(false));
    }
  }, [session, verCarrito, lealtad]);

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

  const guardarPerfil = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('moramango_nombre', nombreUsuario);
    localStorage.setItem('moramango_telefono', telefonoUsuario);
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
        }),
      });

      const data = await res.json();

      if (data.success) {
        setCarrito([]);
        localStorage.removeItem(CARRITO_KEY);
        setVerCarrito(false);
        setNotas('');
        setBeneficioAplicado(false);
        setLealtad(null);
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
          <p className="text-neutral-500 mb-2">Tu número de pedido es:</p>
          <p className="text-lg font-mono font-bold text-black bg-neutral-100 px-4 py-2 rounded-xl mb-6">
            {pedidoConfirmado}
          </p>
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
            Recibirás una notificación cuando tu pedido esté listo para recoger.
          </p>
          <button
            onClick={() => setPedidoConfirmado(null)}
            className="bg-black text-white font-bold py-3 px-8 rounded-2xl active:scale-95 transition-transform"
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
        <div className={`flex flex-col h-full ${verCarrito || verPerfil ? 'hidden' : 'flex'}`}>
          <header className="bg-white pt-6 pb-2 sticky top-0 z-20 shadow-sm rounded-b-3xl shrink-0">
            <div className="px-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-neutral-100 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-cover"
                    onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-black leading-none">Moramango</h1>
                  <p className="text-xs text-neutral-500 font-medium mt-1">Blend to Go</p>
                </div>
              </div>
              <button
                onClick={() => session ? setVerPerfil(true) : signIn('google', { callbackUrl: '/' })}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform ${
                  session ? 'bg-black text-white' : 'bg-neutral-100 text-black'
                }`}
              >
                {session ? '👤' : '🔑'}
              </button>
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
                    categoriaActiva === cat ? 'bg-black text-white' : 'bg-neutral-100 text-black'
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

          <div className="p-4 flex-1 overflow-y-auto pb-32">
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
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-black text-white active:scale-90 transition-transform"
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
                className="w-full bg-black text-white p-4 rounded-2xl flex justify-between items-center shadow-[0_10px_40px_rgba(0,0,0,0.3)] active:scale-95 transition-transform"
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
                                : 'bg-black text-white'
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
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black transition-colors resize-none"
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
                className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
              >
                {enviando ? 'Enviando...' : session ? 'Confirmar Orden' : 'Iniciar sesión para pedir'}
              </button>
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

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Nombre Completo</label>
                <input type="text" value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)}
                  placeholder="Ej. Laura Edith"
                  className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black transition-colors shadow-sm" required />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Teléfono de Contacto</label>
                <input type="tel" value={telefonoUsuario} onChange={(e) => setTelefonoUsuario(e.target.value)}
                  placeholder="Ej. 8186003207"
                  className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black transition-colors shadow-sm" required />
              </div>

              <button type="submit" className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md mt-8">
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
                    className="w-full bg-black text-white font-bold text-base py-4 rounded-2xl active:scale-95 transition-transform shadow-md"
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
                        className="w-11 h-11 flex items-center justify-center bg-black text-white rounded-xl font-medium shadow-sm active:scale-90 text-lg"
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
