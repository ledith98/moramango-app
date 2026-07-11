'use client';

import { useCallback, useEffect, useState } from 'react';

interface Producto {
  ID_Producto: string;
  Nombre: string;
  Categoría: string;
  Descripcion: string;
  Precio_Venta: string;
  Disponible: string;
}

interface FormProducto {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: string;
}

const FORM_VACIO: FormProducto = { nombre: '', categoria: '', descripcion: '', precio: '' };

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarProductos = useCallback(() => {
    setCargando(true);
    fetch('/api/admin/productos')
      .then((res) => res.json())
      .then((data) => setProductos(data.productos || []))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  const toggleDisponible = async (p: Producto) => {
    const nuevoValor = !(p.Disponible === 'TRUE' || p.Disponible === 'true');
    setProductos((prev) =>
      prev.map((x) => (x.ID_Producto === p.ID_Producto ? { ...x, Disponible: nuevoValor ? 'TRUE' : 'FALSE' } : x))
    );
    await fetch('/api/admin/productos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idProducto: p.ID_Producto, disponible: nuevoValor }),
    });
  };

  const abrirEditar = (p: Producto) => {
    setEditando(p);
    setForm({
      nombre: p.Nombre,
      categoria: p.Categoría,
      descripcion: p.Descripcion,
      precio: p.Precio_Venta,
    });
    setError('');
  };

  const abrirCrear = () => {
    setCreando(true);
    setForm(FORM_VACIO);
    setError('');
  };

  const cerrarModal = () => {
    setEditando(null);
    setCreando(false);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    const precioNum = parseFloat(form.precio);
    if (isNaN(precioNum) || precioNum < 0) {
      setError('Precio inválido');
      return;
    }

    setGuardando(true);
    setError('');
    try {
      if (editando) {
        await fetch('/api/admin/productos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idProducto: editando.ID_Producto,
            nombre: form.nombre,
            categoria: form.categoria,
            descripcion: form.descripcion,
            precio: precioNum,
          }),
        });
      } else {
        const res = await fetch('/api/admin/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: form.nombre,
            categoria: form.categoria,
            descripcion: form.descripcion,
            precio: precioNum,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      cerrarModal();
      cargarProductos();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p: Producto) => {
    if (!confirm(`¿Eliminar "${p.Nombre}"? Dejará de estar disponible y desaparecerá del panel.`)) return;
    setProductos((prev) => prev.filter((x) => x.ID_Producto !== p.ID_Producto));
    await fetch(`/api/admin/productos?id=${encodeURIComponent(p.ID_Producto)}`, { method: 'DELETE' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{productos.length} producto{productos.length === 1 ? '' : 's'}</span>
        <button
          onClick={abrirCrear}
          className="bg-black text-white font-semibold px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          + Nuevo producto
        </button>
      </div>

      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando productos...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {productos.map((p) => {
            const disponible = p.Disponible === 'TRUE' || p.Disponible === 'true';
            return (
              <div key={p.ID_Producto} className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-400 uppercase tracking-wide">{p.Categoría}</p>
                    <h3 className="font-bold text-neutral-900 truncate">{p.Nombre}</h3>
                  </div>
                  <button
                    onClick={() => toggleDisponible(p)}
                    className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                      disponible ? 'bg-green-500' : 'bg-neutral-300'
                    }`}
                    title={disponible ? 'Disponible — click para desactivar' : 'No disponible — click para activar'}
                  >
                    <span
                      className={`absolute left-0 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        disponible ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {p.Descripcion && <p className="text-sm text-neutral-500 line-clamp-2">{p.Descripcion}</p>}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="font-bold text-black">${parseFloat(p.Precio_Venta || '0').toFixed(2)}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => abrirEditar(p)}
                      className="text-sm font-semibold text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => eliminar(p)}
                      className="text-sm font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editando || creando) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={cerrarModal}>
          <form
            onSubmit={guardar}
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-black">{editando ? 'Editar producto' : 'Nuevo producto'}</h2>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Categoría</label>
              <input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Ej. Jugos"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Descripción</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                rows={3}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">Precio</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={cerrarModal}
                className="flex-1 border border-neutral-200 text-neutral-600 font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 bg-black text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
