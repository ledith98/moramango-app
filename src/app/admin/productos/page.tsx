'use client';

import { useCallback, useEffect, useState } from 'react';
import { comprimirImagen, enMegas } from '@/lib/comprimirImagen';
import { esEnlaceDeVisorDrive } from '@/lib/imagenes';
import { parsearTamanos, TAMANOS_SUGERIDOS, type Tamano } from '@/lib/tamanos';
import { type GrupoOpcion, parsearOpciones } from '@/lib/opciones';
import { catalogoExtras, claveExtra, type Extra, parsearExtras } from '@/lib/extras';
import { claveCategoria, posicionCategoria } from '@/lib/categorias';

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
  Existencias?: string;
  Tamanos?: string;
  Opciones?: string;
  Extras?: string;
  Orden_Menu?: string;
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
  existencias: string;
  /** Vacío = un solo precio. Con renglones = precio por tamaño. */
  tamanos: Tamano[];
  /** Vacío = no se pregunta nada. Con grupos = el cliente elige. */
  opciones: GrupoOpcion[];
  /** Toppings opcionales que suman al precio */
  extras: Extra[];
}

const FORM_VACIO: FormProducto = {
  nombre: '',
  categoria: '',
  descripcion: '',
  precio: '',
  emoji: '',
  existencias: '',
  tamanos: [],
  opciones: [],
  extras: [],
};


export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  /** Orden de los grupos, el mismo que ve el cliente (Panel → Ajustes) */
  const [ordenCategorias, setOrdenCategorias] = useState<string[]>([]);
  const [acomodando, setAcomodando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Foto del producto (solo al editar: se necesita el ID para guardarla)
  const [imagenUrl, setImagenUrl] = useState('');
  /** Qué pasó con la foto al subirla; no es un error, es información */
  const [aviso, setAviso] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [pegarUrl, setPegarUrl] = useState(false);
  /** Fotos que todavía viven fuera de la app (en Drive) */
  const [fotosFuera, setFotosFuera] = useState(0);
  /**
   * En qué estado está el almacén de fotos.
   *
   * Se muestra a propósito, aunque todo esté bien. Sin esto, "no aparece
   * nada" significaba las tres cosas a la vez —el almacén no está, la
   * actualización no ha llegado, o ya no hay nada que traer— y no había
   * forma de saber cuál. Quien activa el almacén necesita ver si sirvió.
   */
  const [almacen, setAlmacen] = useState<'cargando' | 'sin-actualizar' | 'apagado' | 'listo'>(
    'cargando'
  );
  const [mudando, setMudando] = useState(false);
  const [avanceMudanza, setAvanceMudanza] = useState('');
  const [fallasMudanza, setFallasMudanza] = useState<string[]>([]);

  const cargarProductos = useCallback(() => {
    setCargando(true);
    Promise.all([
      fetch('/api/admin/productos').then((r) => r.json()),
      fetch('/api/admin/ajustes').then((r) => r.json()),
    ])
      .then(([prod, ajustes]) => {
        setProductos(prod.productos || []);
        setOrdenCategorias(ajustes?.ordenCategorias || []);
      })
      .finally(() => setCargando(false));

    // Cuántas fotos siguen viviendo en Drive. Si el almacén no está
    // activo devuelve 0 y el aviso ni aparece.
    fetch('/api/admin/productos/imagen/migrar')
      .then(async (r) => {
        // 404 = este despliegue todavía no trae la pantalla nueva
        if (r.status === 404) return setAlmacen('sin-actualizar');
        if (!r.ok) return setAlmacen('sin-actualizar');
        const d = await r.json();
        setFotosFuera(d.pendientes || 0);
        setAlmacen(d.listo ? 'listo' : 'apagado');
      })
      .catch(() => setAlmacen('sin-actualizar'));
  }, []);

  /**
   * Trae a la app las fotos que están en Drive.
   *
   * Se hace de tres en tres porque bajar y volver a subir treinta fotos no
   * cabe en una sola llamada. Se corta cuando una tanda no logra mover
   * ninguna: eso significa que las que quedan están rotas y reintentar
   * daría vueltas para siempre.
   */
  const mudarFotos = async () => {
    setMudando(true);
    setFallasMudanza([]);
    try {
      let quedan = fotosFuera;
      const total = fotosFuera;
      for (;;) {
        const res = await fetch('/api/admin/productos/imagen/migrar', { method: 'POST' });
        const d = await res.json();
        if (!res.ok) {
          setFallasMudanza([d.error || 'No se pudo traer las fotos']);
          break;
        }
        quedan = d.pendientes ?? 0;
        setFotosFuera(quedan);
        setAvanceMudanza(`Traídas ${total - quedan} de ${total}…`);
        if (d.errores?.length) setFallasMudanza((x) => [...x, ...d.errores]);
        if (quedan === 0 || d.migradas === 0) break;
      }
      setAvanceMudanza('');
      cargarProductos();
    } catch {
      setFallasMudanza(['No se pudo conectar. Revisa tu internet.']);
    } finally {
      setMudando(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  // La tienda agrupa el menú por el texto exacto de la categoría, así que
  // "Combos" y "COMBOS" salían como dos secciones distintas.
  const categoriasExistentes = Array.from(
    new Set(productos.map((p) => (p.Categoría || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const orden = (p: Producto) => parseInt(p.Orden_Menu ?? '') || 9999;

  /**
   * Los productos se ven agrupados y en el mismo orden que en la tienda y
   * en Venta. Antes salían en el orden de las filas del Excel, así que un
   * producto nuevo aparecía hasta el final y lejos de los suyos.
   */
  const grupos = Array.from(
    new Set(productos.map((p) => (p.Categoría || 'Otros').trim() || 'Otros'))
  )
    .sort(
      (a, b) =>
        posicionCategoria(a, ordenCategorias) - posicionCategoria(b, ordenCategorias) ||
        a.localeCompare(b, 'es')
    )
    .map((cat) => ({
      cat,
      items: productos
        .filter((p) => claveCategoria(p.Categoría || 'Otros') === claveCategoria(cat))
        .sort((a, b) => orden(a) - orden(b)),
    }));

  /** Lista completa, ya aplanada, en el orden en que se ve en pantalla. */
  const idsEnOrden = (gs: typeof grupos) => gs.flatMap((g) => g.items.map((p) => p.ID_Producto));

  /**
   * Sube o baja un producto dentro de su grupo. Para cambiarlo de grupo se
   * edita su categoría, que es lo que ya hacía esa decisión.
   */
  const mover = async (cat: string, i: number, hacia: -1 | 1) => {
    const g = grupos.find((x) => x.cat === cat);
    if (!g) return;
    const j = i + hacia;
    if (j < 0 || j >= g.items.length) return;

    const nuevos = [...g.items];
    [nuevos[i], nuevos[j]] = [nuevos[j], nuevos[i]];
    const listos = grupos.map((x) => (x.cat === cat ? { ...x, items: nuevos } : x));
    const ids = idsEnOrden(listos);

    // Se pinta el cambio de inmediato y luego se guarda: mover una flecha
    // y esperar a Google para verla moverse se siente descompuesto.
    setProductos((prev) => {
      const pos = new Map(ids.map((id, n) => [id, n + 1]));
      return prev.map((p) =>
        pos.has(p.ID_Producto) ? { ...p, Orden_Menu: String(pos.get(p.ID_Producto)) } : p
      );
    });

    setAcomodando(true);
    try {
      await fetch('/api/admin/productos/orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } finally {
      setAcomodando(false);
    }
  };

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
      existencias: p.Existencias ?? '',
      tamanos: parsearTamanos(p.Tamanos ?? ''),
      opciones: parsearOpciones(p.Opciones ?? ''),
      extras: parsearExtras(p.Extras ?? ''),
    });
    setImagenUrl(p.Imagen_URL || '');
    setAviso('');
    setPegarUrl(false);
    setError('');
  };

  /**
   * Los toppings que ya existen en el menú, del más usado al menos.
   *
   * Sale de los productos que ya están cargados, así que no cuesta ni una
   * lectura más. Se recalcula al guardar porque `productos` cambia, y con
   * eso un topping nuevo aparece de inmediato para los demás.
   */
  const extrasDelMenu = catalogoExtras(productos.map((p) => p.Extras ?? ''));

  /**
   * Los que este producto todavía no lleva, para ofrecerlos de un toque.
   *
   * Se compara con claveExtra y no por texto: si el producto ya trae
   * "Jamón", no tiene caso volver a ofrecerle "Jamon".
   */
  const extrasQueFaltan = extrasDelMenu.filter(
    (x) => !form.extras.some((e) => claveExtra(e.nombre) === claveExtra(x.nombre))
  );

  /**
   * Toppings repetidos dentro de este producto.
   *
   * El servidor ya los rechaza al guardar, pero enterarse hasta entonces
   * cuesta un viaje y un mensaje de error. Aquí se ve al momento, que es
   * cuando se puede corregir sin perder nada.
   */
  const extrasRepetidos = [
    ...new Set(
      form.extras
        .map((e) => claveExtra(e.nombre))
        .filter((c, i, todas) => c && todas.indexOf(c) !== i)
    ),
  ].map((c) => form.extras.find((e) => claveExtra(e.nombre) === c)!.nombre);

  const abrirCrear = () => {
    setCreando(true);
    setForm(FORM_VACIO);
    setImagenUrl('');
    setPegarUrl(false);
    setError('');
  };

  /** Sube la foto y la guarda de inmediato, sin esperar a "Guardar". */
  const subirImagen = async (original: File) => {
    if (!editando) return;
    setSubiendo(true);
    setError('');
    setAviso('');
    try {
      // Se achica aquí, en el teléfono: las fotos de cámara pesan más de
      // lo que el servidor acepta, y la que sí pasa se le mandaría entera
      // a cada cliente que abre la tienda con datos.
      const foto = await comprimirImagen(original);
      if (foto.despues < foto.antes) {
        setAviso(
          `Foto lista: pasó de ${enMegas(foto.antes)} a ${enMegas(foto.despues)} para que la tienda cargue rápido.`
        );
      }
      const archivo = foto.archivo;
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
            existencias: form.existencias,
            tamanos: form.tamanos,
            opciones: form.opciones,
            extras: form.extras,
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
            existencias: form.existencias,
            tamanos: form.tamanos,
            opciones: form.opciones,
            extras: form.extras,
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
      {/*
        El almacén está creado en Vercel pero esta app todavía no lo ve.
        Pasa siempre por lo mismo: la llave que Vercel agrega solo entra en
        un despliegue NUEVO, y el que está corriendo es de antes. Decirlo
        aquí evita quedarse mirando una pantalla que no cambia.
      */}
      {almacen === 'apagado' && (
        <div className="bg-neutral-100 border border-neutral-300 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-neutral-900">
            📷 El guardado de fotos todavía no está prendido
          </p>
          <p className="text-xs text-neutral-800">
            Por ahora no puedes subir fotos desde el celular; solo pegar la dirección de una que ya
            esté en internet. Si ya creaste el almacén en Vercel y sigue saliendo esto, falta el
            paso de <strong>Redeploy</strong>: la llave que Vercel agregó solo entra en un
            despliegue nuevo, y el que está corriendo es de antes de crearlo.
          </p>
          <p className="text-xs text-neutral-800">
            En Vercel: pestaña <strong>Deployments</strong> → el primero de la lista → los tres
            puntitos <strong>⋯</strong> → <strong>Redeploy</strong>. Tarda un par de minutos;
            luego recarga esta pantalla.
          </p>
        </div>
      )}

      {/*
        No se pudo preguntar. En producción casi no pasa —si esta pantalla
        se pintó, la ruta existe— pero un corte de red no puede quedarse
        callado: sin esto parecería que todo está bien.
      */}
      {almacen === 'sin-actualizar' && (
        <p className="text-xs font-semibold text-neutral-800 bg-neutral-100 border border-neutral-300 rounded-xl p-3">
          No pude revisar cómo está el guardado de fotos. Recarga la pantalla.
        </p>
      )}

      {/* Sirve de confirmación: activaste el almacén y sí quedó */}
      {almacen === 'listo' && fotosFuera === 0 && (
        <p className="text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">
          ✅ Guardado de fotos prendido. Ya puedes subirlas desde el celular con “📷 Subir foto”, y
          todas tus fotos viven en la app.
        </p>
      )}

      {/* Solo sale si hay fotos en Drive y el almacén ya está activo */}
      {fotosFuera > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-amber-900">
            📷 {fotosFuera} foto{fotosFuera === 1 ? '' : 's'} todavía vive
            {fotosFuera === 1 ? '' : 'n'} en Google Drive
          </p>
          <p className="text-xs text-amber-800">
            Funcionan, pero no son tuyas: si a esos archivos les cambian el permiso o se mueven de
            carpeta, la tienda se queda sin fotos y nadie se entera hasta que un cliente lo ve.
            Tráelas a la app de un jalón — no tienes que volver a subirlas.
          </p>
          <button
            onClick={mudarFotos}
            disabled={mudando}
            className="w-full sm:w-auto bg-amber-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
          >
            {mudando ? avanceMudanza || 'Trayendo…' : 'Traer las fotos a la app'}
          </button>
          {fallasMudanza.length > 0 && (
            <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2 space-y-1">
              <p className="font-semibold">Estas no se pudieron traer:</p>
              {fallasMudanza.map((f, i) => (
                <p key={i}>· {f}</p>
              ))}
              <p className="text-red-700">
                Las puedes volver a subir a mano desde el producto, con “📷 Subir foto”.
              </p>
            </div>
          )}
        </div>
      )}

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
        <div className="space-y-6">
          {grupos.map(({ cat, items }) => (
            <section key={cat}>
              <h3 className="font-bold text-neutral-900 mb-1">
                {cat}{' '}
                <span className="font-normal text-sm text-neutral-600">
                  ({items.length})
                </span>
              </h3>
              <p className="text-xs text-neutral-600 mb-3">
                Con las flechas cambias el orden en que se ven, tanto en la tienda como en Venta.
                Para pasarlo a otro grupo, edítalo y cámbiale la categoría.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p, indice) => {
            const estado = estadoDe(p);
            return (
              <div key={p.ID_Producto} className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => mover(cat, indice, -1)}
                    disabled={indice === 0 || acomodando}
                    aria-label={`Subir ${p.Nombre}`}
                    className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-900 font-bold active:scale-90 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => mover(cat, indice, 1)}
                    disabled={indice === items.length - 1 || acomodando}
                    aria-label={`Bajar ${p.Nombre}`}
                    className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-900 font-bold active:scale-90 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <span className="text-xs font-semibold text-neutral-600 ml-1">
                    {indice + 1}º de {items.length}
                  </span>
                </div>
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
            </section>
          ))}
        </div>
      )}

      {(editando || creando) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={cerrarModal}>
          <form
            onSubmit={guardar}
            /* Alto tope + scroll propio: con tamaños y opciones el
               formulario crecía más que la pantalla y el botón de Guardar
               quedaba fuera, sin manera de bajar hasta él. */
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-black px-6 pt-6 pb-3 shrink-0">
              {editando ? 'Editar producto' : 'Nuevo producto'}
            </h2>

            <div className="flex-1 overflow-y-auto px-6 space-y-4">

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

            {!editando && (
              <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                La foto se agrega después de guardar, cuando el producto ya existe. Todo lo demás
                —incluidos tamaños y opciones— lo puedes dejar listo desde aquí.
              </p>
            )}

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

                {/* No es un error: es contarle qué pasó con su foto */}
                {aviso && (
                  <p className="text-xs font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg p-2">
                    {aviso}
                  </p>
                )}

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

            <div className="space-y-1.5 text-neutral-900">
                <label className="text-sm font-semibold text-neutral-700">
                  Existencias{' '}
                  <span className="font-normal text-neutral-600">(solo productos de reventa)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.existencias}
                  onChange={(e) => setForm({ ...form, existencias: e.target.value })}
                  placeholder="Déjalo vacío si no llevas conteo"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                />
                <p className="text-xs text-neutral-600">
                  Para conchas, galletas, bites y demás de reventa: pon cuántas piezas hay y la
                  tienda mostrará &ldquo;últimas piezas&rdquo; y &ldquo;agotado&rdquo;, descontando
                  con cada venta. Los productos elaborados (sándwiches, jugos, licuados) déjalo
                  vacío.
                </p>
              </div>

            <div className="space-y-2 text-neutral-900 border-t border-neutral-100 pt-4">
                <div>
                  <label className="text-sm font-semibold text-neutral-700">
                    Tamaños con precio propio{' '}
                    <span className="font-normal text-neutral-600">(jugos y licuados)</span>
                  </label>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Si pones tamaños, el cliente elige cuál quiere y se cobra el precio de ese
                    tamaño. El precio de arriba deja de usarse en este producto.
                  </p>
                </div>

                {form.tamanos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        tamanos: TAMANOS_SUGERIDOS.map((nombre, i) => ({
                          nombre,
                          // El grande arranca al doble como punto de partida
                          precio: (parseFloat(form.precio) || 0) * (i === 0 ? 1 : 2),
                        })),
                      })
                    }
                    className="w-full border-2 border-dashed border-neutral-300 rounded-xl py-3 text-sm font-semibold text-neutral-700 active:scale-95"
                  >
                    + Vender por tamaños (500 ml y 1 litro)
                  </button>
                ) : (
                  <>
                    {form.tamanos.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={t.nombre}
                          onChange={(e) => {
                            const copia = [...form.tamanos];
                            copia[i] = { ...copia[i], nombre: e.target.value };
                            setForm({ ...form, tamanos: copia });
                          }}
                          placeholder="500 ml"
                          className="flex-1 min-w-0 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                        />
                        <span className="text-lg font-bold text-neutral-700">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="decimal"
                          value={t.precio}
                          onChange={(e) => {
                            const copia = [...form.tamanos];
                            copia[i] = { ...copia[i], precio: parseFloat(e.target.value) };
                            setForm({ ...form, tamanos: copia });
                          }}
                          className="w-24 shrink-0 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, tamanos: form.tamanos.filter((_, j) => j !== i) })
                          }
                          aria-label={`Quitar ${t.nombre}`}
                          className="w-11 h-11 shrink-0 rounded-xl bg-neutral-100 text-neutral-700 font-bold active:scale-90"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, tamanos: [...form.tamanos, { nombre: '', precio: 0 }] })
                        }
                        className="text-sm font-semibold text-neutral-700 px-3 py-2 rounded-lg bg-neutral-100 active:scale-95"
                      >
                        + Otro tamaño
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, tamanos: [] })}
                        className="text-sm font-semibold text-neutral-700 px-3 py-2 rounded-lg active:scale-95"
                      >
                        Quitar tamaños
                      </button>
                    </div>
                  </>
                )}
              </div>

            <div className="space-y-2 text-neutral-900 border-t border-neutral-100 pt-4">
              <div>
                <label className="text-sm font-semibold text-neutral-700">
                  Toppings extra{' '}
                  <span className="font-normal text-neutral-600">(con costo)</span>
                </label>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Agregados opcionales. El cliente puede llevar varios o ninguno, y cada uno se
                  suma al precio del producto.
                </p>
              </div>

              {form.extras.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    list="toppings-del-menu"
                    value={e.nombre}
                    onChange={(ev) => {
                      const copia = [...form.extras];
                      copia[i] = { ...copia[i], nombre: ev.target.value };
                      setForm({ ...form, extras: copia });
                    }}
                    onBlur={(ev) => {
                      /*
                        Al salir del campo, si lo escrito es un topping que
                        ya existe en el menú, se adopta su nombre exacto y
                        su precio.

                        El nombre, para que "jamon" no nazca como un
                        topping aparte de "Jamón". El precio, solo si
                        todavía está en cero: el mismo topping cuesta lo
                        mismo en toda la carta, y volver a teclearlo es la
                        puerta por la que entran las diferencias.
                      */
                      const conocido = extrasDelMenu.find(
                        (x) => claveExtra(x.nombre) === claveExtra(ev.target.value)
                      );
                      if (!conocido) return;
                      const copia = [...form.extras];
                      copia[i] = {
                        nombre: conocido.nombre,
                        precio: copia[i].precio > 0 ? copia[i].precio : conocido.precio,
                      };
                      setForm({ ...form, extras: copia });
                    }}
                    placeholder="Chía"
                    className="flex-1 min-w-0 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                  />
                  <span className="text-lg font-bold text-neutral-700">+$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={e.precio}
                    onChange={(ev) => {
                      const copia = [...form.extras];
                      copia[i] = { ...copia[i], precio: parseFloat(ev.target.value) };
                      setForm({ ...form, extras: copia });
                    }}
                    className="w-24 shrink-0 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, extras: form.extras.filter((_, j) => j !== i) })
                    }
                    aria-label={`Quitar ${e.nombre}`}
                    className="w-11 h-11 shrink-0 rounded-xl bg-neutral-100 text-neutral-700 font-bold active:scale-90"
                  >
                    ×
                  </button>
                </div>
              ))}

              {extrasRepetidos.length > 0 && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5">
                  {extrasRepetidos.length === 1
                    ? `"${extrasRepetidos[0]}" está dos veces. Quita uno antes de guardar.`
                    : `Estos están repetidos: ${extrasRepetidos.join(', ')}. Quita los de más antes de guardar.`}
                </p>
              )}

              {/*
                Los toppings que ya usa el menú, de un toque.

                Es el camino corto y el que mantiene la carta pareja: casi
                siempre el topping que se va a poner ya está en otro
                producto, y tecleándolo otra vez es como nacieron "Jamon"
                y "Queso suizo" como toppings aparte del que ya existía.
              */}
              {extrasQueFaltan.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-700 mb-1">
                    Ya los usas en otros productos — tócalos para agregarlos
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {extrasQueFaltan.map((x) => (
                      <button
                        key={x.nombre}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            extras: [...form.extras, { nombre: x.nombre, precio: x.precio }],
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-neutral-100 text-neutral-900 text-xs font-semibold active:scale-95"
                      >
                        {x.nombre}
                        <span className="font-normal text-neutral-700">
                          {' '}
                          +${x.precio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Para escribirlos: el mismo catálogo, en el teclado */}
              <datalist id="toppings-del-menu">
                {extrasDelMenu.map((x) => (
                  <option key={x.nombre} value={x.nombre} />
                ))}
              </datalist>

              <button
                type="button"
                onClick={() => setForm({ ...form, extras: [...form.extras, { nombre: '', precio: 0 }] })}
                className="w-full border-2 border-dashed border-neutral-300 rounded-xl py-3 text-sm font-semibold text-neutral-700 active:scale-95"
              >
                + Agregar uno que no está en la lista
              </button>
            </div>

            <div className="space-y-3 text-neutral-900 border-t border-neutral-100 pt-4">
                <div>
                  <label className="text-sm font-semibold text-neutral-700">
                    Opciones a elegir{' '}
                    <span className="font-normal text-neutral-600">(combos)</span>
                  </label>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    Preguntas que se le hacen al cliente antes de agregarlo, como el queso o el
                    sabor de la bebida. No cambian el precio.
                  </p>
                </div>

                {form.opciones.map((g, gi) => (
                  <div key={gi} className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={g.nombre}
                        onChange={(e) => {
                          const copia = [...form.opciones];
                          copia[gi] = { ...copia[gi], nombre: e.target.value };
                          setForm({ ...form, opciones: copia });
                        }}
                        placeholder="Queso"
                        className="flex-1 min-w-0 bg-white border border-neutral-200 rounded-lg p-2.5 font-semibold text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, opciones: form.opciones.filter((_, j) => j !== gi) })
                        }
                        aria-label={`Quitar la pregunta ${g.nombre}`}
                        className="w-10 h-10 shrink-0 rounded-lg bg-neutral-200 text-neutral-800 font-bold active:scale-90"
                      >
                        ×
                      </button>
                    </div>

                    {g.opciones.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2 pl-3">
                        <span className="text-neutral-500 shrink-0">·</span>
                        <input
                          value={o}
                          onChange={(e) => {
                            const copia = [...form.opciones];
                            const lista = [...copia[gi].opciones];
                            lista[oi] = e.target.value;
                            copia[gi] = { ...copia[gi], opciones: lista };
                            setForm({ ...form, opciones: copia });
                          }}
                          placeholder="Queso suizo"
                          className="flex-1 min-w-0 bg-white border border-neutral-200 rounded-lg p-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-black"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const copia = [...form.opciones];
                            copia[gi] = {
                              ...copia[gi],
                              opciones: copia[gi].opciones.filter((_, j) => j !== oi),
                            };
                            setForm({ ...form, opciones: copia });
                          }}
                          aria-label={`Quitar ${o}`}
                          className="w-9 h-9 shrink-0 rounded-lg bg-neutral-100 text-neutral-700 font-bold active:scale-90"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const copia = [...form.opciones];
                        copia[gi] = { ...copia[gi], opciones: [...copia[gi].opciones, ''] };
                        setForm({ ...form, opciones: copia });
                      }}
                      className="ml-3 text-xs font-semibold text-neutral-700 px-3 py-1.5 rounded-lg bg-neutral-200 active:scale-95"
                    >
                      + Agregar opción
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      opciones: [...form.opciones, { nombre: '', opciones: ['', ''] }],
                    })
                  }
                  className="w-full border-2 border-dashed border-neutral-300 rounded-xl py-3 text-sm font-semibold text-neutral-700 active:scale-95"
                >
                  + Nueva pregunta al cliente
                </button>
              </div>

              <div className="h-2" />
            </div>

            <div className="shrink-0 border-t border-neutral-100 px-6 py-4 space-y-3 bg-white sm:rounded-b-3xl">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
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
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
