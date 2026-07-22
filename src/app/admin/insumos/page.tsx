'use client';

/**
 * Panel de insumos, dividido en dos pestañas:
 *
 *  · Biblioteca      → el catálogo: qué es cada insumo, cómo se compra,
 *                      en qué unidad lo usan las recetas y su costo.
 *  · Insumos activos → la operación: cuánto hay, cuánto se gasta al día,
 *                      para cuántos días alcanza y el conteo físico.
 *
 * El stock siempre se guarda en unidad de receta; la compra se captura en
 * unidad de compra y el backend la convierte con la equivalencia.
 */

import { useCallback, useEffect, useState } from 'react';
import { CATEGORIAS_INSUMOS } from '@/lib/insumos';

interface ItemBiblioteca {
  id: string;
  nombre: string;
  unidadCompra: string;
  unidadReceta: string;
  equivalencia: number;
  ultimoPrecioCompra: number;
  costoPorUnidadReceta: number | null;
  categoria: string;
  proveedor: string;
  contacto: string;
  recetas: string[];
  ingredientes: string[];
  /** true = se une por nombre idéntico, sin vínculo declarado a mano */
  vinculoAutomatico: boolean;
  /** false = guardado para después, no aparece en Insumos activos */
  enUso: boolean;
}

interface IngredienteReceta {
  nombre: string;
  cantidad: string;
  unidad: string;
  /** Nombre del insumo que ya reclama este ingrediente, si hay otro */
  vinculadoA: string;
}

interface ProductoConReceta {
  id: string;
  nombre: string;
  categoria: string;
  disponible: boolean;
  ingredientes: IngredienteReceta[];
}

interface ItemActivo {
  id: string;
  idBiblioteca: string;
  nombre: string;
  unidadCompra: string;
  unidadReceta: string;
  equivalencia: number;
  costoPorUnidadReceta: number | null;
  categoria: string;
  proveedor: string;
  stockActual: number;
  consumoPorDia: number;
  alcanzaParaDias: number | null;
  nivel: 'rojo' | 'amarillo' | 'verde' | 'gris';
  sugerenciaCompra: number;
  ultimaCompra: string;
  diasDesdeCompra: number | null;
  status: string;
  conteoFisico: number | null;
  fechaConteo: string;
  diferencia: number | null;
}

interface CompraHistorial {
  fecha: string;
  cantidad: number;
  unidadCompra: string;
  precioTotal: number;
  precioUnidadCompra: number;
  costoUnidadReceta: number;
}

const UNIDADES_COMPRA = ['Caja', 'Litro', 'Kilo', 'Pieza', 'Paquete', 'Bolsa'];
const UNIDADES_RECETA = ['ml', 'g', 'pieza'];
const STATUS = ['Fresco', 'Por caducar', 'Caducado'];
const NUEVA_CATEGORIA = '__nueva__';
const SIN_CATEGORIA = 'Sin categoría';

const PUNTO_NIVEL: Record<string, string> = {
  rojo: 'bg-red-500',
  amarillo: 'bg-amber-400',
  verde: 'bg-green-500',
  gris: 'bg-neutral-300',
};

const COLOR_STATUS: Record<string, string> = {
  Fresco: 'bg-green-100 text-green-700',
  'Por caducar': 'bg-amber-100 text-amber-700',
  Caducado: 'bg-red-100 text-red-700',
};

const ICONO_GRUPO: Record<string, string> = {
  'Frutas y verduras': '🥬',
  Pan: '🍞',
  'Jamón y queso': '🧀',
  'Leche y agua': '🥛',
  Complementos: '🍯',
  Empaque: '📦',
  Condimentos: '🥫',
  [SIN_CATEGORIA]: '❔',
};

const FORM_VACIO = {
  nombre: '',
  unidadCompra: 'Litro',
  unidadReceta: 'ml',
  equivalencia: '1000',
  categoria: '',
  proveedor: '',
  contacto: '',
  ultimoPrecioCompra: '',
};

/**
 * Sugerencia automática: un ingrediente de receta corresponde al insumo si
 * uno contiene al otro por palabras. "Lechuga" ↔ "Lechuga Italiana EVA".
 */
function sugiere(nombreInsumo: string, nombreIngrediente: string): boolean {
  const limpia = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length > 2);

  const a = limpia(nombreInsumo);
  const b = limpia(nombreIngrediente);
  if (a.length === 0 || b.length === 0) return false;
  return b.some((p) => a.includes(p)) || a.some((p) => b.includes(p));
}

const inputCls =
  'w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron';

export default function InsumosPage() {
  const [pestana, setPestana] = useState<'biblioteca' | 'activos'>('activos');
  const [biblioteca, setBiblioteca] = useState<ItemBiblioteca[]>([]);
  const [activos, setActivos] = useState<ItemActivo[]>([]);
  const [categoriasEnUso, setCategoriasEnUso] = useState<string[]>([]);
  const [diasAnalisis, setDiasAnalisis] = useState(7);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('Todos');
  const [listaCopiada, setListaCopiada] = useState(false);

  // Modales
  const [form, setForm] = useState({ ...FORM_VACIO });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [modalInsumo, setModalInsumo] = useState(false);
  const [compraDe, setCompraDe] = useState<ItemActivo | null>(null);
  const [compraCantidad, setCompraCantidad] = useState('');
  const [compraPrecio, setCompraPrecio] = useState('');
  const [historial, setHistorial] = useState<CompraHistorial[] | null>(null);
  const [historialDe, setHistorialDe] = useState('');
  const [recetasDe, setRecetasDe] = useState<{ id: string; nombre: string } | null>(null);
  const [productosCat, setProductosCat] = useState<ProductoConReceta[]>([]);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [buscaProducto, setBuscaProducto] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [rB, rA] = await Promise.all([
        fetch('/api/admin/biblioteca'),
        fetch('/api/admin/insumos'),
      ]);
      const dB = await rB.json();
      const dA = await rA.json();
      setBiblioteca(dB.items ?? []);
      setCategoriasEnUso(dB.categoriasEnUso ?? []);
      setActivos(dA.items ?? []);
      if (dA.diasAnalisis) setDiasAnalisis(dA.diasAnalisis);
    } catch {
      setError('No se pudo cargar el inventario');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todasCategorias = [...new Set([...CATEGORIAS_INSUMOS, ...categoriasEnUso])].filter(Boolean);

  // ── Biblioteca: crear / editar / eliminar ──────────────────────────────────
  function abrirNuevo() {
    setForm({ ...FORM_VACIO });
    setEditandoId(null);
    setError('');
    setModalInsumo(true);
  }

  function abrirEditar(b: ItemBiblioteca) {
    setForm({
      nombre: b.nombre,
      unidadCompra: b.unidadCompra,
      unidadReceta: b.unidadReceta,
      equivalencia: String(b.equivalencia),
      categoria: b.categoria,
      proveedor: b.proveedor,
      contacto: b.contacto,
      ultimoPrecioCompra: b.ultimoPrecioCompra ? String(b.ultimoPrecioCompra) : '',
    });
    setEditandoId(b.id);
    setError('');
    setModalInsumo(true);
  }

  async function guardarInsumo() {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio');
    const equiv = parseFloat(form.equivalencia);
    if (isNaN(equiv) || equiv <= 0) return setError('La equivalencia debe ser mayor a 0');

    setOcupado(true);
    setError('');
    const res = editandoId
      ? await fetch('/api/admin/biblioteca', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editandoId, accion: 'editar', datos: form }),
        })
      : await fetch('/api/admin/biblioteca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) return setError(data.error || 'No se pudo guardar');
    setModalInsumo(false);
    await cargar();
  }

  async function eliminarInsumo(b: ItemBiblioteca) {
    if (!confirm(`¿Quitar "${b.nombre}" de la biblioteca? Su historial se conserva.`)) return;
    setOcupado(true);
    await fetch('/api/admin/biblioteca', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, accion: 'eliminar' }),
    });
    setOcupado(false);
    await cargar();
  }

  // ── Activos: compra / conteo / ajuste / status ─────────────────────────────
  async function accionActivo(id: string, cuerpo: Record<string, unknown>) {
    setOcupado(true);
    const res = await fetch('/api/admin/insumos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...cuerpo }),
    });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) {
      alert(data.error || 'No se pudo guardar');
      return false;
    }
    await cargar();
    return true;
  }

  function abrirCompra(a: ItemActivo) {
    setCompraDe(a);
    setCompraCantidad(a.sugerenciaCompra > 0 ? String(a.sugerenciaCompra) : '');
    setCompraPrecio('');
    setError('');
  }

  async function registrarCompra() {
    if (!compraDe) return;
    const cant = parseFloat(compraCantidad);
    if (isNaN(cant) || cant <= 0) return setError('Escribe cuánto compraste');
    const ok = await accionActivo(compraDe.id, {
      accion: 'compra',
      cantidadCompra: cant,
      precioTotal: compraPrecio,
    });
    if (ok) setCompraDe(null);
  }

  async function capturarConteo(a: ItemActivo) {
    const valor = prompt(
      `Conteo físico de ${a.nombre} (en ${a.unidadReceta}):`,
      String(a.stockActual)
    );
    if (valor === null) return;
    const num = parseFloat(valor.replace(',', '.'));
    if (isNaN(num) || num < 0) return alert('Cantidad inválida');
    await accionActivo(a.id, { accion: 'conteo', cantidad: num });
  }

  async function ajustar(a: ItemActivo) {
    if (a.conteoFisico === null) return;
    if (!confirm(`¿Igualar el stock de ${a.nombre} a ${a.conteoFisico} ${a.unidadReceta}?`)) return;
    await accionActivo(a.id, { accion: 'ajustar' });
  }

  // ── Vínculo insumo ↔ ingredientes de las recetas ──────────────────────────
  /**
   * Se abre desde las dos pestañas: en Biblioteca el id es el del insumo,
   * en Activos se usa el idBiblioteca, que es el mismo registro.
   */
  async function abrirRecetas(idBiblioteca: string, nombre: string) {
    const yaVinculados =
      biblioteca.find((b) => b.id === idBiblioteca)?.ingredientes ?? [];
    setRecetasDe({ id: idBiblioteca, nombre });
    setSeleccion(yaVinculados);
    setBuscaProducto('');
    setError('');
    const res = await fetch('/api/admin/biblioteca?ingredientes=1');
    const data = await res.json();
    setProductosCat(data.productos ?? []);
  }

  function alternarIngrediente(nombre: string) {
    setSeleccion((s) => (s.includes(nombre) ? s.filter((x) => x !== nombre) : [...s, nombre]));
  }

  /** Marca o desmarca de golpe toda la receta de un producto. */
  function alternarProducto(p: ProductoConReceta) {
    const nombres = p.ingredientes.map((i) => i.nombre);
    const todosMarcados = nombres.every((n) => seleccion.includes(n));
    setSeleccion((s) =>
      todosMarcados
        ? s.filter((x) => !nombres.includes(x))
        : [...new Set([...s, ...nombres])]
    );
  }

  /** Marca de golpe los ingredientes que se parecen al nombre del insumo. */
  function aplicarSugerencias() {
    if (!recetasDe) return;
    const sugeridos = productosCat
      .flatMap((p) => p.ingredientes.map((i) => i.nombre))
      .filter((n) => sugiere(recetasDe.nombre, n));
    setSeleccion((s) => [...new Set([...s, ...sugeridos])]);
  }

  async function guardarRecetas() {
    if (!recetasDe) return;
    setOcupado(true);
    const res = await fetch('/api/admin/biblioteca', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: recetasDe.id, accion: 'ingredientes', ingredientes: seleccion }),
    });
    setOcupado(false);
    if (!res.ok) return setError('No se pudo guardar el vínculo');
    setRecetasDe(null);
    await cargar();
  }

  /** Corrige el stock a mano cuando se capturó mal, sin tocar precios. */
  async function editarStock(a: ItemActivo) {
    const valor = prompt(
      `¿Cuánto tienes realmente de ${a.nombre}? (en ${a.unidadReceta})`,
      String(a.stockActual)
    );
    if (valor === null) return;
    const num = parseFloat(valor.replace(',', '.'));
    if (isNaN(num) || num < 0) return alert('Cantidad inválida');
    await accionActivo(a.id, { accion: 'stock', cantidad: num });
  }

  /** Mueve un insumo entre "Insumos activos" y "solo biblioteca". */
  async function cambiarUso(id: string, nombre: string, enUso: boolean) {
    if (
      !enUso &&
      !confirm(
        `¿Quitar "${nombre}" de los insumos activos? Se queda guardado en la biblioteca con todos sus datos y puedes reactivarlo cuando quieras.`
      )
    )
      return;
    await accionActivo(id, { accion: 'uso', valor: enUso });
  }

  async function verHistorial(idBiblioteca: string, nombre: string) {
    setHistorialDe(nombre);
    setHistorial([]);
    const res = await fetch(`/api/admin/insumos?historial=${encodeURIComponent(idBiblioteca)}`);
    const data = await res.json();
    setHistorial(data.historial ?? []);
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const coincide = (nombre: string, categoria: string) => {
    const q = busqueda.trim().toLowerCase();
    if (q && !nombre.toLowerCase().includes(q)) return false;
    if (filtroGrupo !== 'Todos' && (categoria || SIN_CATEGORIA) !== filtroGrupo) return false;
    return true;
  };

  // El buscador del modal mira nombre de producto e ingredientes, para
  // poder llegar por cualquiera de los dos.
  const qProducto = buscaProducto.trim().toLowerCase();
  const productosVisibles = qProducto
    ? productosCat.filter(
        (p) =>
          p.nombre.toLowerCase().includes(qProducto) ||
          p.ingredientes.some((i) => i.nombre.toLowerCase().includes(qProducto))
      )
    : productosCat;

  const activosFiltrados = activos.filter((a) => coincide(a.nombre, a.categoria));
  const bibliotecaFiltrada = biblioteca.filter((b) => coincide(b.nombre, b.categoria));

  const alertas = activos
    .filter((a) => a.nivel === 'rojo' || a.nivel === 'amarillo')
    .sort((a, b) => (a.alcanzaParaDias ?? 99) - (b.alcanzaParaDias ?? 99));

  function copiarLista() {
    const texto = alertas
      .map((a) => `• ${a.nombre}: ${a.sugerenciaCompra} ${a.unidadCompra || 'u'}`)
      .join('\n');
    navigator.clipboard.writeText(`🛒 Lista de compras Moramango\n\n${texto}`);
    setListaCopiada(true);
    setTimeout(() => setListaCopiada(false), 2000);
  }

  if (cargando) {
    return <p className="p-6 text-neutral-500">Cargando inventario…</p>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">📦 Insumos</h1>
        <button
          onClick={abrirNuevo}
          className="bg-marron text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95"
        >
          + Nuevo insumo
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 bg-neutral-100 p-1 rounded-2xl mb-4 w-fit">
        {(
          [
            ['activos', `🧊 Insumos activos (${activos.length})`],
            ['biblioteca', `📚 Biblioteca (${biblioteca.length})`],
          ] as const
        ).map(([valor, etiqueta]) => (
          <button
            key={valor}
            onClick={() => setPestana(valor)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              pestana === valor ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <p className="text-xs text-neutral-500 mb-4">
        {pestana === 'activos'
          ? 'Lo que usas hoy: stock, consumo y compras. Con "📚 A biblioteca" lo guardas sin borrarlo.'
          : 'Tu catálogo completo, incluidos los insumos guardados para después. Con "🧊 Usar ahora" vuelven a la operación diaria.'}
      </p>

      {biblioteca.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-800">
          Tu biblioteca está vacía. Registra ahí cada insumo (cómo lo compras y en qué unidad lo
          usan las recetas) para que la app pueda descontar el stock con cada venta.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar insumo…"
          className="flex-1 min-w-[180px] bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-marron"
        />
        <select
          value={filtroGrupo}
          onChange={(e) => setFiltroGrupo(e.target.value)}
          className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-marron"
        >
          <option value="Todos">Todas las categorías</option>
          {[...todasCategorias, SIN_CATEGORIA].map((c) => (
            <option key={c} value={c}>
              {ICONO_GRUPO[c] ?? '·'} {c}
            </option>
          ))}
        </select>
      </div>

      {pestana === 'activos' ? (
        <>
          {alertas.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-neutral-900">🛒 Hay que comprar</h2>
                <button
                  onClick={copiarLista}
                  className="text-xs font-semibold bg-neutral-100 px-3 py-1.5 rounded-lg active:scale-95"
                >
                  {listaCopiada ? '✅ Copiada' : 'Copiar lista'}
                </button>
              </div>
              <ul className="space-y-1 text-sm">
                {alertas.map((a) => (
                  <li key={a.id} className="text-neutral-700">
                    {a.nivel === 'rojo' ? '🔴' : '🟡'} <strong>{a.nombre}</strong> — queda para ~
                    {a.alcanzaParaDias ?? 0} día{a.alcanzaParaDias === 1 ? '' : 's'}
                    {a.sugerenciaCompra > 0 && (
                      <span className="text-neutral-500">
                        {' '}
                        · comprar {a.sugerenciaCompra} {a.unidadCompra || ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-neutral-400 mb-2">
            El consumo por día se calcula con las ventas de los últimos {diasAnalisis} días.
          </p>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-100">
                  <th className="p-3 font-semibold">Insumo</th>
                  <th className="p-3 font-semibold">Stock</th>
                  <th className="p-3 font-semibold">Consumo/día</th>
                  <th className="p-3 font-semibold">Alcanza para</th>
                  <th className="p-3 font-semibold">Última compra</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Conteo físico</th>
                  <th className="p-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {activosFiltrados.map((a) => (
                  <tr key={a.id} className="hover:bg-neutral-50">
                    <td className="p-3">
                      <p className="font-semibold text-neutral-900">{a.nombre}</p>
                      <p className="text-xs text-neutral-400">{a.categoria || SIN_CATEGORIA}</p>
                    </td>
                    <td className="p-3 font-semibold text-neutral-900 whitespace-nowrap">
                      {a.stockActual} {a.unidadReceta}
                    </td>
                    <td className="p-3 text-neutral-600 whitespace-nowrap">
                      {a.consumoPorDia > 0 ? `${a.consumoPorDia} ${a.unidadReceta}` : '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${PUNTO_NIVEL[a.nivel]}`} />
                        {a.alcanzaParaDias !== null ? (
                          <span className="text-neutral-700">
                            ~{a.alcanzaParaDias} día{a.alcanzaParaDias === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="text-neutral-400">sin datos</span>
                        )}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-neutral-600">
                      {a.diasDesdeCompra !== null ? (
                        <>
                          <span className="text-xs">
                            {a.diasDesdeCompra === 0 ? 'Hoy' : `Hace ${a.diasDesdeCompra} d`}
                          </span>
                          <button
                            onClick={() => verHistorial(a.idBiblioteca, a.nombre)}
                            className="block text-[11px] text-marron font-semibold mt-0.5"
                          >
                            Ver precios
                          </button>
                        </>
                      ) : (
                        <span className="text-neutral-400 text-xs">Sin registrar</span>
                      )}
                    </td>
                    <td className="p-3">
                      <select
                        value={a.status}
                        disabled={ocupado}
                        onChange={(e) =>
                          accionActivo(a.id, { accion: 'status', valor: e.target.value })
                        }
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold border-0 focus:outline-none ${
                          COLOR_STATUS[a.status] ?? 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        <option value="">—</option>
                        {STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {a.conteoFisico !== null ? (
                        <div>
                          <p className="text-neutral-700">
                            {a.conteoFisico} {a.unidadReceta}
                            {a.diferencia !== null && a.diferencia !== 0 && (
                              <span
                                className={`ml-1.5 text-xs font-semibold ${
                                  a.diferencia < 0 ? 'text-red-600' : 'text-green-600'
                                }`}
                              >
                                ({a.diferencia > 0 ? '+' : ''}
                                {a.diferencia})
                              </span>
                            )}
                          </p>
                          {a.fechaConteo && (
                            <p className="text-[10px] text-neutral-400">{a.fechaConteo}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          onClick={() => abrirCompra(a)}
                          disabled={ocupado}
                          className="text-xs font-semibold bg-marron text-white px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap"
                        >
                          + Compra
                        </button>
                        <button
                          onClick={() => capturarConteo(a)}
                          disabled={ocupado}
                          className="text-xs font-semibold text-black bg-neutral-200 px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap"
                        >
                          Conteo
                        </button>
                        <button
                          onClick={() => abrirRecetas(a.idBiblioteca, a.nombre)}
                          className="text-xs font-semibold text-black bg-neutral-200 px-3 py-1.5 rounded-lg active:scale-95 whitespace-nowrap"
                          title="Elegir en qué productos se usa este insumo"
                        >
                          🔗 Recetas
                        </button>
                        <button
                          onClick={() => editarStock(a)}
                          disabled={ocupado}
                          className="text-xs font-semibold text-black bg-neutral-200 px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap"
                          title="Corregir el stock si se capturó mal"
                        >
                          ✏️ Stock
                        </button>
                        {a.conteoFisico !== null && a.diferencia !== 0 && (
                          <button
                            onClick={() => ajustar(a)}
                            disabled={ocupado}
                            className="text-xs font-semibold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap"
                          >
                            Ajustar
                          </button>
                        )}
                        <button
                          onClick={() => cambiarUso(a.id, a.nombre, false)}
                          disabled={ocupado}
                          className="text-[11px] font-semibold text-neutral-700 px-3 py-1 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap"
                          title="Guardarlo en la biblioteca sin usarlo por ahora"
                        >
                          📚 A biblioteca
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-neutral-400">
                      No hay insumos activos que mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-100">
                <th className="p-3 font-semibold">Insumo</th>
                <th className="p-3 font-semibold">Se compra por</th>
                <th className="p-3 font-semibold">Equivale a</th>
                <th className="p-3 font-semibold">Último precio</th>
                <th className="p-3 font-semibold">Costo por unidad de receta</th>
                <th className="p-3 font-semibold">Proveedor</th>
                <th className="p-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {bibliotecaFiltrada.map((b) => (
                <tr key={b.id} className="hover:bg-neutral-50">
                  <td className="p-3">
                    <p className="font-semibold text-neutral-900">{b.nombre}</p>
                    <p className="text-xs text-neutral-400">
                      {b.id} · {b.categoria || SIN_CATEGORIA}
                    </p>
                    <span
                      className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
                        b.enUso ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {b.enUso ? '🧊 En uso' : '💤 Guardado para después'}
                    </span>
                    {b.recetas.length > 0 ? (
                      <p className="text-[11px] text-green-700 mt-0.5" title={b.recetas.join(', ')}>
                        🍹 En {b.recetas.length} producto{b.recetas.length === 1 ? '' : 's'}:{' '}
                        {b.recetas.slice(0, 2).join(', ')}
                        {b.recetas.length > 2 ? ` +${b.recetas.length - 2}` : ''}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        ⚠️ Sin receta asociada — no se le descuenta stock
                      </p>
                    )}
                    {b.ingredientes.length > 0 && (
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        🔗 {b.ingredientes.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-neutral-700 whitespace-nowrap">{b.unidadCompra || '—'}</td>
                  <td className="p-3 text-neutral-600 whitespace-nowrap">
                    {b.equivalencia} {b.unidadReceta}
                  </td>
                  <td className="p-3 text-neutral-900 whitespace-nowrap">
                    {b.ultimoPrecioCompra > 0 ? (
                      <>
                        ${b.ultimoPrecioCompra}
                        <span className="text-neutral-400 text-xs"> / {b.unidadCompra}</span>
                      </>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {b.costoPorUnidadReceta !== null ? (
                      <span className="font-semibold text-neutral-900">
                        ${b.costoPorUnidadReceta}
                        <span className="text-neutral-400 font-normal text-xs">
                          {' '}
                          / {b.unidadReceta}
                        </span>
                      </span>
                    ) : (
                      <span className="text-neutral-400">registra una compra</span>
                    )}
                  </td>
                  <td className="p-3 text-neutral-600">
                    {b.proveedor || <span className="text-neutral-400">—</span>}
                    {b.contacto && <p className="text-[11px] text-neutral-400">{b.contacto}</p>}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <button
                        onClick={() => cambiarUso(b.id, b.nombre, !b.enUso)}
                        disabled={ocupado}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 disabled:opacity-50 whitespace-nowrap ${
                          b.enUso ? 'bg-neutral-100 text-neutral-600' : 'bg-green-50 text-green-700'
                        }`}
                        title={
                          b.enUso
                            ? 'Quitarlo de los insumos activos'
                            : 'Empezar a usarlo: aparecerá en Insumos activos'
                        }
                      >
                        {b.enUso ? '💤 Guardar' : '🧊 Usar ahora'}
                      </button>
                      <button
                        onClick={() => abrirRecetas(b.id, b.nombre)}
                        className="text-xs font-semibold text-black bg-neutral-200 px-2.5 py-1.5 rounded-lg active:scale-95 whitespace-nowrap"
                        title="Elegir a qué ingredientes de las recetas corresponde"
                      >
                        🔗 Recetas
                      </button>
                      <button
                        onClick={() => verHistorial(b.id, b.nombre)}
                        className="text-xs font-semibold text-black bg-neutral-200 px-2.5 py-1.5 rounded-lg active:scale-95"
                        title="Historial de precios"
                      >
                        📈
                      </button>
                      <button
                        onClick={() => abrirEditar(b)}
                        className="text-xs font-semibold text-black bg-neutral-200 px-2.5 py-1.5 rounded-lg active:scale-95"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => eliminarInsumo(b)}
                        disabled={ocupado}
                        className="text-xs font-semibold bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg active:scale-95 disabled:opacity-50"
                        title="Quitar de la biblioteca"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {bibliotecaFiltrada.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-neutral-400">
                    Aún no hay insumos en la biblioteca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: nuevo / editar insumo de la biblioteca ── */}
      {modalInsumo && (
        <Modal
          titulo={editandoId ? 'Editar insumo' : 'Nuevo insumo'}
          onCerrar={() => setModalInsumo(false)}
        >
          <label className="block text-xs font-semibold text-neutral-500 mb-1">Nombre</label>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Leche entera"
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">
                Se compra por
              </label>
              <input
                list="unidades-compra"
                value={form.unidadCompra}
                onChange={(e) => setForm({ ...form, unidadCompra: e.target.value })}
                className={inputCls}
              />
              <datalist id="unidades-compra">
                {UNIDADES_COMPRA.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">
                Unidad en recetas
              </label>
              <input
                list="unidades-receta"
                value={form.unidadReceta}
                onChange={(e) => setForm({ ...form, unidadReceta: e.target.value })}
                className={inputCls}
              />
              <datalist id="unidades-receta">
                {UNIDADES_RECETA.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <label className="block text-xs font-semibold text-neutral-500 mb-1 mt-3">
            Equivalencia
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 whitespace-nowrap">
              1 {form.unidadCompra || 'unidad'} =
            </span>
            <input
              type="number"
              value={form.equivalencia}
              onChange={(e) => setForm({ ...form, equivalencia: e.target.value })}
              className={inputCls}
            />
            <span className="text-sm text-neutral-500">{form.unidadReceta || 'u'}</span>
          </div>

          <label className="block text-xs font-semibold text-neutral-500 mb-1 mt-3">Categoría</label>
          <select
            value={form.categoria}
            onChange={(e) => {
              if (e.target.value === NUEVA_CATEGORIA) {
                const nueva = prompt('Nombre de la nueva categoría:');
                if (nueva?.trim()) setForm({ ...form, categoria: nueva.trim() });
              } else {
                setForm({ ...form, categoria: e.target.value });
              }
            }}
            className={inputCls}
          >
            <option value="">Sin categoría</option>
            {todasCategorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {form.categoria && !todasCategorias.includes(form.categoria) && (
              <option value={form.categoria}>{form.categoria}</option>
            )}
            <option value={NUEVA_CATEGORIA}>➕ Nueva categoría…</option>
          </select>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Proveedor</label>
              <input
                value={form.proveedor}
                onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Contacto</label>
              <input
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {editandoId && (
            <>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 mt-3">
                Último precio de compra (por {form.unidadCompra || 'unidad'})
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={form.ultimoPrecioCompra}
                onChange={(e) => setForm({ ...form, ultimoPrecioCompra: e.target.value })}
                className={inputCls}
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Corrige aquí un precio mal capturado. No registra una compra ni suma stock.
              </p>
            </>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            onClick={guardarInsumo}
            disabled={ocupado}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-4 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </Modal>
      )}

      {/* ── Modal: registrar compra ── */}
      {compraDe && (
        <Modal titulo={`Compra de ${compraDe.nombre}`} onCerrar={() => setCompraDe(null)}>
          <label className="block text-xs font-semibold text-neutral-500 mb-1">
            ¿Cuánto compraste? (en {compraDe.unidadCompra || 'unidades'})
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={compraCantidad}
            onChange={(e) => setCompraCantidad(e.target.value)}
            className={inputCls}
            autoFocus
          />

          <label className="block text-xs font-semibold text-neutral-500 mb-1 mt-3">
            ¿Cuánto pagaste en total? ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={compraPrecio}
            onChange={(e) => setCompraPrecio(e.target.value)}
            placeholder="Opcional — actualiza el costo"
            className={inputCls}
          />

          <p className="text-xs text-neutral-500 mt-3 bg-neutral-50 rounded-xl p-3">
            Se sumarán{' '}
            <strong>
              {(parseFloat(compraCantidad) || 0) * compraDe.equivalencia} {compraDe.unidadReceta}
            </strong>{' '}
            al stock (1 {compraDe.unidadCompra} = {compraDe.equivalencia} {compraDe.unidadReceta}).
          </p>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            onClick={registrarCompra}
            disabled={ocupado}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-4 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : 'Registrar compra'}
          </button>
        </Modal>
      )}

      {/* ── Modal: vincular con las recetas de Productos ── */}
      {recetasDe && (
        <Modal titulo={`Recetas de ${recetasDe.nombre}`} onCerrar={() => setRecetasDe(null)}>
          <p className="text-xs text-neutral-500 mb-3">
            Marca los ingredientes de tus productos que salen de este insumo. Puedes marcar varios:
            así, cada venta descuenta del mismo stock.
          </p>

          <button
            onClick={aplicarSugerencias}
            className="w-full text-xs font-semibold text-black bg-neutral-200 py-2 rounded-xl mb-3 active:scale-95"
          >
            ✨ Marcar automáticamente los que se parecen
          </button>

          <input
            value={buscaProducto}
            onChange={(e) => setBuscaProducto(e.target.value)}
            placeholder="Buscar producto o ingrediente…"
            className={`${inputCls} mb-3`}
          />

          <div className="max-h-80 overflow-y-auto -mx-1 px-1">
            {productosVisibles.length === 0 && (
              <p className="text-sm text-neutral-400 py-4 text-center">
                Ningún producto coincide con “{buscaProducto}”.
              </p>
            )}

            {productosVisibles.map((p) => {
              const nombres = p.ingredientes.map((i) => i.nombre);
              const marcados = nombres.filter((n) => seleccion.includes(n)).length;
              return (
                <div key={p.id} className="border border-neutral-100 rounded-2xl p-3 mb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-neutral-900">{p.nombre}</p>
                      <p className="text-[11px] text-neutral-400">
                        {p.categoria}
                        {!p.disponible && ' · apagado en la tienda'}
                        {marcados > 0 && ` · ${marcados} marcado${marcados === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {p.ingredientes.length > 0 && (
                      <button
                        onClick={() => alternarProducto(p)}
                        className="text-[11px] font-semibold text-black bg-neutral-200 px-2.5 py-1 rounded-lg active:scale-95 whitespace-nowrap shrink-0"
                      >
                        {marcados === nombres.length ? 'Quitar todo' : 'Marcar todo'}
                      </button>
                    )}
                  </div>

                  {p.ingredientes.length === 0 ? (
                    <p className="text-[11px] text-amber-700 mt-2">
                      Sin receta registrada en Catálogo — no hay nada que marcar todavía.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-0.5">
                      {p.ingredientes.map((ing) => {
                        const marcado = seleccion.includes(ing.nombre);
                        const ajeno = ing.vinculadoA && ing.vinculadoA !== recetasDe.nombre;
                        return (
                          <li key={ing.nombre}>
                            <label className="flex gap-2 py-1 cursor-pointer items-start">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() => alternarIngrediente(ing.nombre)}
                                className="mt-1 accent-[var(--marca-marron)]"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="text-sm text-neutral-900">{ing.nombre}</span>
                                <span className="text-[11px] text-neutral-400">
                                  {' '}
                                  {ing.cantidad} {ing.unidad}
                                </span>
                                {sugiere(recetasDe.nombre, ing.nombre) && !marcado && (
                                  <span className="ml-1.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                                    sugerido
                                  </span>
                                )}
                                {ajeno && (
                                  <span className="block text-[11px] text-amber-700">
                                    Ya está vinculado a {ing.vinculadoA}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-neutral-400 mt-3">
            El mismo ingrediente puede aparecer en varios productos: al marcarlo en uno queda
            marcado en todos, porque todos descuentan del mismo insumo. Si no marcas ninguno, se
            intenta unir por nombre idéntico.
          </p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            onClick={guardarRecetas}
            disabled={ocupado}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl mt-3 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? 'Guardando…' : `Guardar (${seleccion.length} marcados)`}
          </button>
        </Modal>
      )}

      {/* ── Modal: historial de precios ── */}
      {historial !== null && (
        <Modal titulo={`Precios de ${historialDe}`} onCerrar={() => setHistorial(null)}>
          {historial.length === 0 ? (
            <p className="text-sm text-neutral-500">Todavía no hay compras registradas.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {historial.map((h, k) => (
                <li key={k} className="py-2 flex justify-between gap-3">
                  <div>
                    <p className="text-neutral-900 font-semibold">
                      {h.cantidad} {h.unidadCompra} · ${h.precioTotal}
                    </p>
                    <p className="text-xs text-neutral-400">{h.fecha}</p>
                  </div>
                  <p className="text-neutral-600 text-right whitespace-nowrap">
                    ${h.precioUnidadCompra}
                    <span className="text-neutral-400 text-xs"> / {h.unidadCompra}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg text-neutral-900">{titulo}</h2>
          <button onClick={onCerrar} className="text-neutral-400 text-xl leading-none px-2">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
