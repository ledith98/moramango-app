'use client';

import { useEffect, useState } from 'react';

interface Producto {
  ID_Producto: string;
  Nombre: string;
  Categoría: string;
  Precio_Venta: string;
  Disponible: string;
}

interface ItemVenta {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

const ESTADOS = ['Recibido', 'En preparación', 'Listo para recoger', 'Entregado', 'Cancelado'];
const METODOS = ['Efectivo', 'Terminal'];

export default function VentaPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [estado, setEstado] = useState('Recibido');
  const [notas, setNotas] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState('');
  const [ventaOk, setVentaOk] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/productos')
      .then((res) => res.json())
      .then((data) => {
        const disponibles = (data.productos || []).filter(
          (p: Producto) => p.Disponible === 'TRUE' || p.Disponible === 'true'
        );
        setProductos(disponibles);
      })
      .finally(() => setCargando(false));
  }, []);

  const cantidadDe = (idProducto: string) =>
    items.find((i) => i.id === idProducto)?.cantidad ?? 0;

  const agregar = (p: Producto) => {
    setVentaOk(null);
    setItems((prev) => {
      const existe = prev.find((i) => i.id === p.ID_Producto);
      if (existe) {
        return prev.map((i) =>
          i.id === p.ID_Producto ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: p.ID_Producto,
          nombre: p.Nombre,
          precio: parseFloat(p.Precio_Venta) || 0,
          cantidad: 1,
        },
      ];
    });
  };

  const quitar = (idProducto: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === idProducto);
      if (!item) return prev;
      if (item.cantidad > 1) {
        return prev.map((i) => (i.id === idProducto ? { ...i, cantidad: i.cantidad - 1 } : i));
      }
      return prev.filter((i) => i.id !== idProducto);
    });
  };

  const total = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

  const registrar = async () => {
    setError('');
    if (items.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    if (!nombre.trim()) {
      setError('Escribe el nombre del cliente');
      return;
    }

    setRegistrando(true);
    try {
      const res = await fetch('/api/admin/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          metodoPago,
          estado,
          notas: notas.trim(),
          items,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error al registrar');

      setVentaOk(data.idPedido);
      setItems([]);
      setNombre('');
      setTelefono('');
      setMetodoPago('Efectivo');
      setEstado('Recibido');
      setNotas('');
    } catch (err: any) {
      setError(err.message || 'Error al registrar la venta');
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Columna 1: productos */}
      <div>
        <h2 className="font-bold text-neutral-900 mb-3">Productos</h2>
        {cargando ? (
          <p className="text-neutral-500 animate-pulse">Cargando productos...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {productos.map((p) => {
              const cant = cantidadDe(p.ID_Producto);
              return (
                <div
                  key={p.ID_Producto}
                  className={`relative bg-white rounded-2xl p-3 shadow-sm border text-left ${
                    cant > 0 ? 'border-black' : 'border-neutral-100'
                  }`}
                >
                  <button onClick={() => agregar(p)} className="w-full text-left active:scale-95 transition-transform">
                    <p className="text-[10px] text-neutral-400 uppercase tracking-wide">{p.Categoría}</p>
                    <p className="font-semibold text-neutral-900 text-sm leading-tight">{p.Nombre}</p>
                    <p className="font-bold text-black mt-1">${parseFloat(p.Precio_Venta || '0').toFixed(2)}</p>
                  </button>
                  {cant > 0 && (
                    <div className="mt-2 flex items-center justify-between bg-neutral-100 rounded-lg p-1">
                      <button
                        onClick={() => quitar(p.ID_Producto)}
                        className="w-7 h-7 flex items-center justify-center bg-white rounded-md font-medium shadow-sm active:scale-90"
                      >
                        −
                      </button>
                      <span className="font-bold text-sm tabular-nums">{cant}</span>
                      <button
                        onClick={() => agregar(p)}
                        className="w-7 h-7 flex items-center justify-center bg-black text-white rounded-md font-medium active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Columna 2: datos de la venta */}
      <div className="space-y-4">
        <h2 className="font-bold text-neutral-900">Datos de la venta</h2>

        {items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span className="text-neutral-700">
                  {i.cantidad}× {i.nombre}
                </span>
                <span className="font-semibold text-neutral-900">
                  ${(i.precio * i.cantidad).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              <span className="font-medium text-neutral-500">Total</span>
              <span className="text-xl font-bold text-black">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Nombre del cliente</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Ana"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">
              Teléfono <span className="font-normal text-neutral-400">(opcional, para avisos por WhatsApp)</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/[^\d+]/g, '').slice(0, 16))}
              placeholder="+528186003207"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Método de pago</label>
            <div className="flex gap-2">
              {METODOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetodoPago(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    metodoPago === m ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {m === 'Efectivo' ? '💵 Efectivo' : '💳 Terminal'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Estado inicial</label>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstado(e)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    estado === e ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-neutral-700">Notas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Ej: Sin azúcar, extra hielo..."
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 focus:outline-none focus:border-black resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ventaOk && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <p className="text-green-700 font-semibold">✅ Venta registrada</p>
            <p className="font-mono text-sm text-green-800 mt-1">{ventaOk}</p>
          </div>
        )}

        <button
          onClick={registrar}
          disabled={registrando}
          className="w-full bg-black text-white font-bold text-lg py-4 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-50 disabled:scale-100"
        >
          {registrando ? 'Registrando...' : `Registrar venta${total > 0 ? ` — $${total.toFixed(2)}` : ''}`}
        </button>
      </div>
    </div>
  );
}
