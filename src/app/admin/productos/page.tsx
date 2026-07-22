'use client';

import { useCallback, useEffect, useState } from 'react';
import { esEnlaceDeVisorDrive } from '@/lib/imagenes';

interface Producto {
  ID_Producto: string;
  Nombre: string;
  Categoría: string;
  Descripcion: string;
  Precio_Venta: string;
  Disponible: string;
  Emoji?: string;
  Imagen_URL?: string;
  Oculto?: string;
}

type EstadoProducto = 'vendiendo' | 'pausado' | 'oculto';

const ESTADOS: { valor: EstadoProducto; etiqueta: string; ayuda: string; color: string }[] = [
  {
    valor: 'vendiendo',
    etiqueta: '✅ A la venta',
    ayuda: 'Se ve en el menú y se puede comprar.',
    color: 'bg-green-600 text-white',
  },
  {
    valor: 'pausado',
    etiqueta: '⏸️ Sin existencia',
    ayuda: 'Se ve en el menú como "No disponible por el momento", pero no se puede comprar.',
    color: 'bg-amber-500 text-white',
  },
  {
    valor: 'oculto',
    etiqueta: '🙈 Fuera del menú',
    ayuda: 'No aparece en la tienda. Para productos suspendidos o de temporada.',
    color: 'bg-neutral-700 text-white',
  },
];

const estadoDe = (p: Producto): EstadoProducto => {
  if ((p.Oculto || '').toUpperCase() === 'TRUE') return 'oculto';
  return (p.Disponible || '').toUpperCase() === 'FALSE' ? 'pausado' : 'vendiendo';
};

interface FormProducto {
  nombre: string;
  categoria: string;
  descripcion: string;
  precio: string;
  emoji: string;
}

const FORM_VACIO: FormProducto = {
  nombre: '',
  categoria: '',
  descripcion: '',
  precio: '',
  emoji: '',
};

// Atajos para no tener que abrir el teclado de emojis en la tablet.
// El campo de texto acepta cualquier otro que quieras pegar.
const EMOJIS_SUGERIDOS = [
  // Comida
  '🥪', '🥐', '🍞', '🥗', '🍳', '🧀', '🥓', '🌯', '🍗', '🥑',
  // Bebidas
  '🥤', '🥛', '🧃', '☕', '💧', '🧋', '🍵', '🧊', '🥥', '🍶',
  // Frutas
  '🍓', '🥭', '🍌', '🍍', '🍊', '🍈', '🍉', '🍇', '🍑', '🥝',
  // Dulces
  '🍫', '🍪', '🧁', '🌰', '🍩', '🥮', '🍯', '🍨', '🎂', '🥜',
];

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Foto del producto (solo al editar: se necesita el ID para guardarla)
  const [imagenUrl, setImagenUrl] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [pegarUrl, setPegarUrl] = useState(false);

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

  // La tienda agrupa el menú por el texto exacto de la categoría, así que
  // "Combos" y "COMBOS" salían como dos secciones distintas.
  const categoriasExistentes = Array.from(
    new Set(productos.map((p) => (p.Categoría || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  /** Reusa la categoría que ya existe si solo cambian mayúsculas o acentos. */
  const canonizarCategoria = (valor: string) => {
    const limpia = (s: string) =>
      s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const escrita = limpia(valor);
    if (!escrita) return valor.trim();
    return categoriasExistentes.find((c) => limpia(c) === escrita) ?? valor.trim();
  };

  /**
   * Tres estados, no dos. 'pausado' es el caso que faltaba: se acabó hoy
   * pero el cliente debe seguir viendo que el producto existe.
   */
  const cambiarEstado = async (p: Producto, estado: EstadoProducto) => {
    const disponible = estado === 'vendiendo';
    const oculto = estado === 'oculto';
    setProductos((prev) =>
      prev.map((x) =>
        x.ID_Producto === p.ID_Producto
          ? { ...x, Disponible: disponible ? 'TRUE' : 'FALSE', Oculto: oculto ? 'TRUE' : '' }
          : x
      )
    );
    await fetch('/api/admin/productos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idProducto: p.ID_Producto, disponible, oculto }),
    });
  };

  const abrirEditar = (p: Producto) => {
    setEditando(p);
    setForm({
      nombre: p.Nombre,
      categoria: p.Categoría,
      descripcion: p.Descripcion,
      precio: p.Precio_Venta,
      emoji: p.Emoji || '',
    });
    setImagenUrl(p.Imagen_URL || '');
    setPegarUrl(false);
    setError('');
  };

  const abrirCrear = () => {
    setCreando(true);
    setForm(FORM_VACIO);
    setImagenUrl('');
    setPegarUrl(false);
    setError('');
  };

  /** Sube la foto y la guarda de inmediato, sin esperar a "Guardar". */
  const subirImagen = async (archivo: File) => {
    if (!editando) return;
    setSubiendo(true);
    setError('');
    try {
      const datos = new FormData();
      datos.append('idProducto', editando.ID_Producto);
      datos.append('archivo', archivo);
      const res = await fetch('/api/admin/productos/imagen', { method: 'POST', body: datos });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo subir la imagen');
        // Sin almacenamiento activo queda el camino de pegar la dirección
        if (data.codigo === 'SIN_ALMACENAMIENTO') setPegarUrl(true);
        return;
      }
      setImagenUrl(data.url);
      cargarProductos();
    } catch {
      setError('Error de conexión al subir la imagen');
    } finally {
      setSubiendo(false);
    }
  };

  const quitarImagen = async () => {
    if (!editando) return;
    if (!confirm('¿Quitar la foto? El producto volverá a mostrar su emoji.')) return;
    setSubiendo(true);
    await fetch(`/api/admin/productos/imagen?id=${encodeURIComponent(editando.ID_Producto)}`, {
      method: 'DELETE',
    });
    setImagenUrl('');
    setSubiendo(false);
    cargarProductos();
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
            emoji: form.emoji,
            imagenUrl,
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
            emoji: form.emoji,
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
        <span className="text-sm text-neutral-700">{productos.length} producto{productos.length === 1 ? '' : 's'}</span>
        <button
          onClick={abrirCrear}
          className="bg-black text-white font-semibold px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          + Nuevo producto
        </button>
      </div>

      {cargando ? (
        <p className="text-neutral-700 animate-pulse">Cargando productos...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {productos.map((p) => {
            const estado = estadoDe(p);
            return (
              <div key={p.ID_Producto} className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    {p.Imagen_URL && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.Imagen_URL}
                        alt=""
                        className="w-10 h-10 rounded-lg object-contain bg-neutral-50 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-neutral-600 uppercase tracking-wide">
                        {p.Categoría}
                      </p>
                      <h3 className="font-bold text-neutral-900 truncate">
                        {!p.Imagen_URL && p.Emoji && <span className="mr-1">{p.Emoji}</span>}
                        {p.Nombre}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Tres estados: vender, pausar sin esconder, o sacar del menú */}
                <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-xl">
                  {ESTADOS.map((e) => (
                    <button
                      key={e.valor}
                      onClick={() => cambiarEstado(p, e.valor)}
                      title={e.ayuda}
                      className={`text-[11px] font-semibold py-1.5 rounded-lg leading-tight transition-colors ${
                        estado === e.valor ? e.color : 'text-neutral-700'
                      }`}
                    >
                      {e.etiqueta}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-600 leading-snug">
                  {ESTADOS.find((e) => e.valor === estado)?.ayuda}
                </p>
                {p.Descripcion && <p className="text-sm text-neutral-700 line-clamp-2">{p.Descripcion}</p>}
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

            <div className="space-y-1.5 text-neutral-900">
              <label className="text-sm font-semibold text-neutral-700">Categoría</label>
              <input
                list="categorias-productos"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                onBlur={(e) => setForm({ ...form, categoria: canonizarCategoria(e.target.value) })}
                placeholder="Ej. Jugos"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
              />
              <datalist id="categorias-productos">
                {categoriasExistentes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-xs text-neutral-600">
                Elige una de la lista. Si escribes una que ya existe con otras mayúsculas, se
                corrige sola para no partir el menú en dos.
              </p>
            </div>

            {editando && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-neutral-700">
                  Foto <span className="font-normal text-neutral-600">(opcional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 shrink-0 bg-neutral-100 rounded-xl overflow-hidden flex items-center justify-center">
                    {imagenUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagenUrl} alt="" className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="text-3xl opacity-30">{form.emoji || '📷'}</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label
                      className={`block text-center text-sm font-semibold py-2.5 rounded-xl cursor-pointer active:scale-95 transition-transform ${
                        subiendo ? 'bg-neutral-100 text-neutral-600' : 'bg-black text-white'
                      }`}
                    >
                      {subiendo ? 'Subiendo…' : imagenUrl ? 'Cambiar foto' : '📷 Subir foto'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={subiendo}
                        className="hidden text-neutral-900 placeholder-neutral-600"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) subirImagen(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {imagenUrl && (
                      <button
                        type="button"
                        onClick={quitarImagen}
                        disabled={subiendo}
                        className="w-full text-xs font-semibold text-red-600 bg-red-50 py-2 rounded-xl active:scale-95 disabled:opacity-50"
                      >
                        Quitar foto
                      </button>
                    )}
                  </div>
                </div>

                {pegarUrl ? (
                  <div className="space-y-1.5 pt-1">
                    <input
                      value={imagenUrl}
                      onChange={(e) => setImagenUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 focus:outline-none focus:border-black"
                    />
                    {esEnlaceDeVisorDrive(imagenUrl) ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 text-neutral-900">
                        Reconocí un enlace de Google Drive y lo voy a convertir al formato que sí
                        se puede mostrar. Para que se vea, el archivo debe estar compartido como{' '}
                        <strong>&ldquo;Cualquier persona con el enlace&rdquo;</strong>.
                      </p>
                    ) : (
                      <p className="text-xs text-neutral-600">
                        Se guarda al presionar Guardar, abajo.
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPegarUrl(true)}
                    className="text-xs font-semibold text-neutral-700 underline"
                  >
                    o pegar la dirección de una imagen
                  </button>
                )}

                <p className="text-xs text-neutral-600">
                  PNG, JPG o WEBP, máximo 4 MB. Cuadrada se ve mejor. Si hay foto, la tienda la
                  muestra en lugar del emoji.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-neutral-700">
                Emoji <span className="font-normal text-neutral-600">(opcional)</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="w-14 h-14 shrink-0 bg-neutral-100 rounded-xl flex items-center justify-center text-3xl">
                  {form.emoji || <span className="text-neutral-700 text-base">—</span>}
                </div>
                <input
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  placeholder="🥪"
                  className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 text-center text-xl focus:outline-none focus:border-black"
                />
                {form.emoji && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, emoji: '' })}
                    className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-3 py-2 rounded-xl active:scale-95"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {EMOJIS_SUGERIDOS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setForm({ ...form, emoji: form.emoji === e ? '' : e })}
                    className={`w-9 h-9 rounded-lg text-xl active:scale-90 transition-transform ${
                      form.emoji === e ? 'bg-marron/15 ring-2 ring-marron' : 'bg-neutral-100'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-600">
                Se muestra en la tienda cuando el producto no tiene foto. Puedes poner dos juntos
                para los combos, por ejemplo 🥪🥤.
              </p>
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

            <div className="space-y-1.5 text-neutral-900">
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
