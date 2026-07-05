'use client';

import { useEffect, useState } from 'react';

interface ItemCarrito {
  id: string;
  nombre: string;
  precio: string;
  categoria: string;
  cantidad: number;
}

export default function Home() {
  const [productos, setProductos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  
  // === NUEVOS ESTADOS PARA EL PERFIL ===
  const [verPerfil, setVerPerfil] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [telefonoUsuario, setTelefonoUsuario] = useState('');

  // Cargar datos de la API y recuperar perfil guardado en el navegador
  useEffect(() => {
    fetch('/api/productos')
      .then((res) => res.json())
      .then((data) => {
        if (data.productos) {
          setProductos(data.productos);
        }
        setCargando(false);
      })
      .catch((error) => console.error('Error:', error));

    // Recuperar datos de perfil si el usuario ya se registró antes
    const nombreGuardado = localStorage.getItem('moramango_nombre') || '';
    const telGuardado = localStorage.getItem('moramango_telefono') || '';
    setNombreUsuario(nombreGuardado);
    setTelefonoUsuario(telGuardado);
  }, []);

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

  const limpiarPrecio = (precioTexto: any): number => {
    const num = parseFloat(precioTexto.toString().replace(',', '.'));
    return isNaN(num) ? 0 : num;
  };

  const agregarAlCarrito = (producto: any) => {
    const existe = carrito.find(item => item.id === producto.id);
    if (existe) {
      setCarrito(
        carrito.map(item => 
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      );
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
    }
  };

  const eliminarDelCarrito = (idProducto: string) => {
    const productoEnCarrito = carrito.find(item => item.id === idProducto);
    if (!productoEnCarrito) return;

    let nuevoCarrito;
    if (productoEnCarrito.cantidad > 1) {
      nuevoCarrito = carrito.map(item => 
        item.id === idProducto ? { ...item, cantidad: item.cantidad - 1 } : item
      );
    } else {
      nuevoCarrito = carrito.filter(item => item.id !== idProducto);
    }

    setCarrito(nuevoCarrito);
    if (nuevoCarrito.length === 0) setVerCarrito(false);
  };

  // Guardar datos del perfil de forma permanente en el dispositivo
  const guardarPerfil = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('moramango_nombre', nombreUsuario);
    localStorage.setItem('moramango_telefono', telefonoUsuario);
    setVerPerfil(false);
  };

  const totalArticulos = carrito.reduce((total, item) => total + item.cantidad, 0);
  const totalPagar = carrito.reduce((total, item) => total + (limpiarPrecio(item.precio) * item.cantidad), 0);

  const enviarPedidoWhatsApp = () => {
    if (carrito.length === 0) return;

    // Si el usuario no ha llenado sus datos, lo mandamos a la pantalla de registro primero
    if (!nombreUsuario.trim() || !telefonoUsuario.trim()) {
      alert("Por favor, ingresa tu Nombre y Teléfono en la sección de perfil antes de confirmar tu orden.");
      setVerCarrito(false);
      setVerPerfil(true);
      return;
    }

    const numeroWhatsApp = "5218186003207"; 

    // Mensaje estructurado con los datos del perfil del cliente
    let textoMensaje = `Cliente: ${nombreUsuario.trim()}\n`;
    textoMensaje += `Telefono: ${telefonoUsuario.trim()}\n\n`;
    textoMensaje += "Hola Moramango. Quiero hacer el siguiente pedido:\n\n";

    carrito.forEach((item) => {
      const subtotal = (limpiarPrecio(item.precio) * item.cantidad).toFixed(2);
      textoMensaje += `- ${item.cantidad}x ${item.nombre} ($${subtotal})\n`;
    });

    textoMensaje += `\n*Total a pagar: $${totalPagar.toFixed(2)}*\n\n`;
    textoMensaje += "¿Me confirman en cuanto tiempo puedo pasar por el? Gracias.";

    const mensajeCodificado = encodeURIComponent(textoMensaje);
    const url = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;

    window.open(url, '_blank');
  };

  return (
    <main className="h-[100dvh] bg-neutral-200 font-sans flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-neutral-50 shadow-2xl flex flex-col relative h-full">
        
        {/* === PANTALLA 1: MENÚ === */}
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
              
              {/* ACCIÓN: Al picarle al botón 👤 abre la pantalla del perfil */}
              <button 
                onClick={() => setVerPerfil(true)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg active:scale-90 transition-transform ${
                  nombreUsuario ? 'bg-black text-white' : 'bg-neutral-100 text-black'
                }`}
              >
                👤
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

          <div className="p-4 flex-1 overflow-y-auto pb-28">
            {cargando ? (
              <div className="flex justify-center items-center py-10">
                <p className="text-neutral-500 animate-pulse font-medium">Preparando menú...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(productosPorCategoria).map(([categoria, items]: [string, any]) => {
                  if (categoriaActiva !== 'Todos' && categoriaActiva !== categoria) return null;

                  return (
                    <section key={categoria} className="animate-fade-in">
                      <h2 className="text-xl font-bold text-neutral-900 mb-4 capitalize">{categoria}</h2>
                      <div className="space-y-4">
                        {items.map((producto: any, index: number) => {
                          const itemEnCarrito = carrito.find(item => item.id === producto.id);
                          const cantidadAgregada = itemEnCarrito ? itemEnCarrito.cantidad : 0;

                          return (
                            <div key={producto.id || index} className="flex gap-4 p-4 rounded-3xl bg-white shadow-sm border border-neutral-100">
                              
                              <div className="flex-1 flex flex-col justify-center">
                                <h3 className="font-bold text-neutral-900 leading-tight">{producto.nombre}</h3>
                                {producto.descripcion && (
                                  <p className="text-xs text-neutral-500 mt-1.5 line-clamp-2 leading-relaxed">{producto.descripcion}</p>
                                )}
                                <div className="mt-3 font-bold text-neutral-900">${producto.precio}</div>
                              </div>
                              
                              <div className="relative shrink-0 ml-2">
                                <div className="w-32 h-32 bg-neutral-100 rounded-2xl overflow-hidden flex items-center justify-center relative shadow-sm border border-neutral-50">
                                  {producto.imagen ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-5xl opacity-20">{getIcono(categoria)}</span>
                                  )}

                                  {cantidadAgregada > 0 && (
                                    <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-between px-2 py-1 shadow-md border border-neutral-200 animate-fade-in z-10">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); eliminarDelCarrito(producto.id); }}
                                        className="text-neutral-600 hover:text-red-600 w-5 h-5 flex items-center justify-center font-bold"
                                      >
                                        {cantidadAgregada === 1 ? '🗑️' : '−'}
                                      </button>
                                      
                                      <span className="font-bold text-xs text-neutral-900">{cantidadAgregada}</span>
                                      
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); agregarAlCarrito(producto); }}
                                        className="text-neutral-900 font-bold w-5 h-5 flex items-center justify-center"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                  
                                  {cantidadAgregada === 0 && (
                                     <button 
                                       onClick={() => agregarAlCarrito(producto)}
                                       className="absolute inset-0 w-full h-full flex items-center justify-center bg-transparent z-0"
                                     />
                                  )}
                                </div>
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
                <div className="font-bold text-lg">
                  ${totalPagar.toFixed(2)}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* === PANTALLA 2: VISTA DEL CARRITO === */}
        {verCarrito && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col animate-fade-in h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button 
                onClick={() => setVerCarrito(false)}
                className="w-10 h-10 flex items-center justify-center bg-neutral-100 rounded-full font-bold active:scale-90 mr-3"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-black">Tu Pedido</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carrito.map((item) => {
                const precioSubtotal = limpiarPrecio(item.precio) * item.cantidad;
                return (
                  <div key={item.id} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-neutral-100">
                    <div className="pr-4 flex-1">
                      <h3 className="font-semibold text-neutral-900 leading-tight">{item.nombre}</h3>
                      <p className="text-neutral-500 font-medium text-sm mt-1">
                        ${precioSubtotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center bg-neutral-100 rounded-xl p-1 gap-2 shrink-0">
                      <button onClick={() => eliminarDelCarrito(item.id)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-medium text-neutral-700 shadow-sm active:scale-90">-</button>
                      <span className="font-bold text-neutral-900 px-1 min-w-[16px] text-center">{item.cantidad}</span>
                      <button onClick={() => agregarAlCarrito(item)} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg font-medium text-neutral-700 shadow-sm active:scale-90">+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white p-6 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border-t border-neutral-100 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <span className="text-neutral-500 font-medium text-lg">Total a pagar</span>
                <span className="text-2xl font-bold text-black">${totalPagar.toFixed(2)}</span>
              </div>
              
              <div className="mb-5 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 flex gap-3 items-start">
                <span className="text-base leading-none mt-0.5">💡</span>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Para procesar tu orden y empezar a prepararla, te solicitaremos tu pago (Transferencia o Mercado Pago) vía WhatsApp.
                </p>
              </div>
              
              <button 
                onClick={enviarPedidoWhatsApp}
                className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2"
              >
                <span>Confirmar Orden</span>
              </button>
            </div>
          </div>
        )}

        {/* === NUEVA PANTALLA 3: VISTA DE REGISTRO / PERFIL === */}
        {verPerfil && (
          <div className="absolute inset-0 bg-neutral-50 z-50 flex flex-col animate-fade-in h-full">
            <header className="bg-white p-4 flex items-center shadow-sm shrink-0">
              <button 
                onClick={() => setVerPerfil(false)}
                className="w-10 h-10 flex items-center justify-center bg-neutral-100 rounded-full font-bold active:scale-90 mr-3"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-black">Mis Datos</h2>
            </header>

            <form onSubmit={guardarPerfil} className="flex-1 p-6 space-y-6 overflow-y-auto">
              <p className="text-sm text-neutral-500 leading-relaxed">
                Registra tus datos una sola vez para que podamos identificar tus órdenes rápidamente al enviar tus mensajes de WhatsApp.
              </p>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Nombre Completo</label>
                <input 
                  type="text" 
                  value={nombreUsuario}
                  onChange={(e) => setNombreUsuario(e.target.value)}
                  placeholder="Ej. Laura Edith"
                  className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black transition-colors shadow-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-700 block">Teléfono de Contacto</label>
                <input 
                  type="tel" 
                  value={telefonoUsuario}
                  onChange={(e) => setTelefonoUsuario(e.target.value)}
                  placeholder="Ej. 8186003207"
                  className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black transition-colors shadow-sm"
                  required
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md mt-8"
              >
                Guardar Datos
              </button>
            </form>
          </div>
        )}

      </div>
    </main>
  );
}