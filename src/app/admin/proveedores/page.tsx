'use client';

/**
 * Proveedores: a quién le compras y a cómo.
 *
 * Lo que se le compra a cada uno no se captura: sale del historial de
 * compras. Una lista declarada a mano se desactualiza sola; el historial
 * no puede mentir.
 *
 * La pestaña de comparación es la razón de ser de todo esto: pone el
 * precio del mismo insumo lado a lado y dice cuánto te ahorras yendo con
 * el más barato.
 */

import { useCallback, useEffect, useState } from 'react';
import { enlaceMapa, etiquetaMapa } from '@/lib/mapas';

interface OpcionPrecio {
  idProveedor: string;
  proveedor: string;
  /** Lo que cuesta la pieza / el gramo / el ml: lo único comparable */
  porUnidad: number;
  precioPaquete: number;
  contenido: number;
  promedio: number;
  compras: number;
  ultimaFecha: string;
  esElMasBarato: boolean;
}

interface InsumoDeProveedor {
  id: string;
  nombre: string;
  porUnidad: number;
  precioPaquete: number;
  contenido: number;
  marca: string;
  /** La presentacion de este proveedor, para editarla o borrarla */
  idPresentacion: string;
  unidadCompra: string;
  activa: boolean;
  /** true = anotado como que aqui lo venden, pero aun sin comprarle */
  soloDeclarado: boolean;
  esElMasBarato: boolean;
  cuantosLoVenden: number;
}

interface InsumoCatalogo {
  id: string;
  nombre: string;
  unidadReceta: string;
  unidadCompra: string;
  equivalencia: number;
}

interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  notas: string;
  activo: boolean;
  /** Direccion escrita o enlace de Google Maps */
  direccion: string;
  compras: number;
  gastado: number;
  ultimaCompra: string;
  insumos: InsumoDeProveedor[];
}

interface Comparable {
  id: string;
  nombre: string;
  unidad: string;
  opciones: OpcionPrecio[];
  ahorro: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * El precio por unidad de receta suele ser de centavos ($0.30 la pieza,
 * $0.0429 el gramo). Con dos decimales todo saldría $0.04 y nada se
 * podría comparar, así que se muestran los que hagan falta.
 */
const porPieza = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`);

const inputCls =
  'w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron';

const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function ProveedoresPage() {
  const [pestana, setPestana] = useState<'directorio' | 'comparar'>('directorio');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [comparables, setComparables] = useState<Comparable[]>([]);
  const [catalogo, setCatalogo] = useState<InsumoCatalogo[]>([]);
  /** Alta de "aqui venden esto": proveedor al que se le agrega */
  const [agregarA, setAgregarA] = useState<Proveedor | null>(null);
  const [insForm, setInsForm] = useState({ id: '', marca: '', unidadCompra: '', contenido: '', ultimoPrecio: '' });
  /** Insumo que todavia no existe en el catalogo, se crea al guardar */
  const [insNuevo, setInsNuevo] = useState({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
  /** Presentacion que se esta corrigiendo; null = alta */
  const [insEditando, setInsEditando] = useState<InsumoDeProveedor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  /** 'activos' es lo normal; los ocultos estorban en el dia a dia */
  const [verQuienes, setVerQuienes] = useState<'activos' | 'todos' | 'ocultos'>('activos');

  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', contacto: '', telefono: '', notas: '', direccion: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch('/api/admin/proveedores');
    const d = await r.json();
    if (r.ok) {
      setProveedores(d.proveedores ?? []);
      setComparables(d.comparables ?? []);
      setCatalogo(d.catalogo ?? []);
    } else {
      setError(d.error || 'No se pudo cargar');
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Llama a la API y devuelve si salió bien.
   *
   * Lee la respuesta con cuidado: si el servidor truena devuelve HTML, y
   * `res.json()` lanza — eso dejaba el botón en "Guardando…" para siempre
   * sin decir qué pasó. Aquí cualquier tropiezo termina en un mensaje.
   */
  async function pedir(
    url: string,
    metodo: 'POST' | 'PATCH' | 'DELETE',
    cuerpo?: Record<string, unknown>
  ): Promise<boolean> {
    setOcupado(true);
    setError('');
    try {
      const res = await fetch(url, {
        method: metodo,
        ...(cuerpo
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
          : {}),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        setError(data.error || `No se pudo guardar (error ${res.status})`);
        return false;
      }
      await cargar();
      return true;
    } catch {
      setError('No se pudo conectar. Revisa tu internet y vuelve a intentarlo.');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>) =>
    pedir('/api/admin/proveedores', metodo, cuerpo);

  const visibles = proveedores.filter((p) => {
    if (verQuienes === 'activos' && !p.activo) return false;
    if (verQuienes === 'ocultos' && p.activo) return false;
    const q = sinAcentos(busqueda);
    if (!q) return true;
    return (
      sinAcentos(p.nombre).includes(q) || p.insumos.some((i) => sinAcentos(i.nombre).includes(q))
    );
  });
  const cuantosOcultos = proveedores.filter((p) => !p.activo).length;

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando proveedores…</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">🏪 Proveedores</h1>
          <p className="text-sm text-neutral-700 mt-0.5">
            A quién le compras y a cómo. Lo que le compras a cada uno sale solo de tus compras.
          </p>
        </div>
        <button
          onClick={() => {
            setForm({ nombre: '', contacto: '', telefono: '', notas: '', direccion: '' });
            setNuevo(true);
          }}
          className="bg-marron text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95 whitespace-nowrap"
        >
          + Nuevo
        </button>
      </div>

      <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-2xl w-fit max-w-full">
        {(
          [
            ['directorio', `📇 Directorio (${proveedores.length})`],
            ['comparar', `⚖️ Comparar precios (${comparables.length})`],
          ] as const
        ).map(([v, etiqueta]) => (
          <button
            key={v}
            onClick={() => setPestana(v)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              pestana === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ─────────────────── DIRECTORIO ─────────────────── */}
      {pestana === 'directorio' && (
        <>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor o insumo…"
            className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
          />

          {/* Los ocultos estorban en el día a día, pero su historial sigue
              contando para comparar precios: por eso se filtran, no se borran. */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['activos', `A los que le compro (${proveedores.length - cuantosOcultos})`],
                ['ocultos', `Ocultos (${cuantosOcultos})`],
                ['todos', 'Todos'],
              ] as const
            ).map(([v, etiqueta]) => (
              <button
                key={v}
                onClick={() => setVerQuienes(v)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                  verQuienes === v ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-800'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              {proveedores.length === 0
                ? 'Todavía no hay proveedores. Se dan de alta solos cada vez que anotas dónde compraste un insumo, o puedes agregarlos aquí.'
                : 'Ninguno coincide con lo que buscas.'}
            </div>
          ) : (
            <div className="space-y-3">
              {visibles.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-bold text-neutral-900">
                        {p.nombre}
                        {!p.activo && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                            ya no le compro
                          </span>
                        )}
                      </h2>
                      {(p.contacto || p.telefono) && (
                        <p className="text-xs text-neutral-700 mt-0.5">
                          {p.telefono && (
                            <a href={`tel:${p.telefono}`} className="font-semibold text-marron">
                              📞 {p.telefono}
                            </a>
                          )}
                          {p.telefono && p.contacto && ' · '}
                          {p.contacto}
                        </p>
                      )}
                      {p.notas && <p className="text-xs text-neutral-600 mt-0.5">{p.notas}</p>}
                      {/* Abre Maps con lo que se haya guardado: el enlace
                          tal cual, o la búsqueda de la dirección escrita. */}
                      {p.direccion && (
                        <a
                          href={enlaceMapa(p.direccion)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-marron underline"
                        >
                          📍 {etiquetaMapa(p.direccion)}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setAgregarA(p);
                          setInsEditando(null);
                          setInsForm({ id: '', marca: '', unidadCompra: '', contenido: '', ultimoPrecio: '' });
                          setInsNuevo({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
                          setError('');
                        }}
                        title="Anotar que aquí venden un insumo"
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-marron/10 text-marron active:scale-95"
                      >
                        + Insumo
                      </button>
                      <button
                        onClick={() => guardar('PATCH', { id: p.id, activo: !p.activo })}
                        disabled={ocupado}
                        title={p.activo ? 'Quitarlo de la lista del día a día' : 'Volver a mostrarlo'}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 active:scale-95 disabled:opacity-50"
                      >
                        {p.activo ? '🙈 Ocultar' : '👁️ Mostrar'}
                      </button>
                      <button
                        onClick={() => {
                          setEditando(p);
                          setForm({
                            nombre: p.nombre,
                            contacto: p.contacto,
                            telefono: p.telefono,
                            notas: p.notas,
                            direccion: p.direccion,
                          });
                        }}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 active:scale-95"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-700">
                    <span>
                      <b className="text-neutral-900">{p.compras}</b> compra
                      {p.compras === 1 ? '' : 's'}
                    </span>
                    <span>
                      llevas <b className="text-neutral-900">{money(p.gastado)}</b>
                    </span>
                    {p.ultimaCompra && <span>última: {p.ultimaCompra}</span>}
                  </div>

                  {p.insumos.length > 0 && (
                    <div className="mt-3 border-t border-neutral-100 pt-2">
                      <p className="text-[11px] text-neutral-600 uppercase tracking-wide mb-1.5">
                        Lo que le compras
                      </p>
                      <ul className="space-y-1">
                        {p.insumos.map((i) => (
                          <li key={i.id} className="flex items-center justify-between text-sm gap-2">
                            {/* Tocable: capturar mal la presentación es fácil
                                y hasta ahora no había manera de corregirlo. */}
                            <button
                              onClick={() => {
                                if (!i.idPresentacion) return;
                                setAgregarA(p);
                                setInsEditando(i);
                                setInsNuevo({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
                                setInsForm({
                                  id: i.id,
                                  marca: i.marca,
                                  unidadCompra: i.unidadCompra,
                                  contenido: i.contenido ? String(i.contenido) : '',
                                  ultimoPrecio: i.precioPaquete ? String(i.precioPaquete) : '',
                                });
                                setError('');
                              }}
                              disabled={!i.idPresentacion}
                              className={`text-neutral-800 truncate min-w-0 text-left ${
                                i.idPresentacion ? 'underline decoration-neutral-300' : ''
                              } ${i.activa ? '' : 'line-through text-neutral-500'}`}
                            >
                              {i.nombre}
                              {i.marca && i.marca !== 'No aplica' && (
                                <span className="text-neutral-600"> · {i.marca}</span>
                              )}
                              {i.soloDeclarado && (
                                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                                  aún sin comprar
                                </span>
                              )}
                            </button>
                            <span className="shrink-0 tabular-nums text-right">
                              <span className="font-semibold text-neutral-900">
                                {porPieza(i.porUnidad)}
                              </span>
                              {i.contenido > 1 && (
                                <span className="block text-[10px] text-neutral-600">
                                  {money(i.precioPaquete)} el paquete de {i.contenido}
                                </span>
                              )}
                              {i.cuantosLoVenden > 1 && (
                                <span
                                  className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    i.esElMasBarato
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {i.esElMasBarato ? 'el más barato' : 'hay más barato'}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─────────────────── COMPARAR ─────────────────── */}
      {pestana === 'comparar' && (
        <>
          <p className="text-sm text-neutral-700">
            Insumos que le compras a más de un proveedor, ordenados por lo que te puedes ahorrar.
            El precio es <b>por pieza</b> (o por gramo, o por ml), que es lo único comparable: un
            paquete de 40 tenedores a $12 sale más barato que uno de 25 a $8.
          </p>

          {comparables.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              Todavía no hay nada que comparar: para eso hace falta haberle comprado el mismo
              insumo a dos proveedores distintos, con su precio anotado.
            </div>
          ) : (
            <div className="space-y-3">
              {comparables.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-bold text-neutral-900">{c.nombre}</h2>
                    {c.ahorro > 0 && (
                      <span className="text-xs font-bold text-green-800 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
                        te ahorras {porPieza(c.ahorro)} por {c.unidad || 'unidad'}
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {c.opciones.map((o) => (
                      <li
                        key={o.idProveedor || o.proveedor}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                          o.esElMasBarato ? 'bg-green-50 border border-green-200' : 'bg-neutral-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span
                            className={`text-sm font-semibold ${
                              o.esElMasBarato ? 'text-green-900' : 'text-neutral-900'
                            }`}
                          >
                            {o.esElMasBarato && '✅ '}
                            {o.proveedor}
                          </span>
                          <span className="block text-[11px] text-neutral-600">
                            {o.contenido > 1
                              ? `${money(o.precioPaquete)} el paquete de ${o.contenido} · `
                              : ''}
                            {o.compras} compra{o.compras === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span
                          className={`font-bold tabular-nums shrink-0 text-right ${
                            o.esElMasBarato ? 'text-green-800' : 'text-neutral-900'
                          }`}
                        >
                          {porPieza(o.porUnidad)}
                          <span className="block text-[10px] font-normal text-neutral-600">
                            por {c.unidad || 'unidad'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Anotar que un proveedor vende un insumo, aunque todavía no se le
          haya comprado. Es una presentación con su proveedor: lo mismo que
          se captura al comprar, solo que por adelantado. */}
      {agregarA && (() => {
        const ins = insNuevo.activo
          ? { id: '', nombre: insNuevo.nombre, unidadReceta: insNuevo.unidadReceta || 'pieza', unidadCompra: '', equivalencia: 0 }
          : catalogo.find((c) => c.id === insForm.id);
        const contenido = parseFloat(insForm.contenido.replace(',', '.')) || 0;
        const precio = parseFloat(insForm.ultimoPrecio.replace(',', '.')) || 0;
        const porUnidad = contenido > 0 && precio > 0 ? precio / contenido : 0;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90%] overflow-y-auto p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-900">
                  {insEditando
                    ? `Corregir ${insEditando.nombre} en ${agregarA.nombre}`
                    : `¿Qué venden en ${agregarA.nombre}?`}
                </h3>
                <button
                  onClick={() => {
                    setAgregarA(null);
                    setInsEditando(null);
                    setInsNuevo({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
                    setError('');
                  }}
                  className="text-neutral-600 text-xl leading-none px-2"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-neutral-700">
                {insEditando
                  ? 'Corrige lo que esté mal. El insumo no se cambia: si te equivocaste de insumo, bórralo y agrega el correcto.'
                  : 'Queda anotado aunque todavía no le compres. Es cuando más sirve: para saber a dónde ir antes de salir.'}
              </p>

              <label className="block text-sm font-semibold text-neutral-800">Insumo</label>
              <select
                value={insNuevo.activo ? '__nuevo__' : insForm.id}
                disabled={!!insEditando}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') {
                    setInsNuevo({ ...insNuevo, activo: true });
                    setInsForm({ ...insForm, id: '', unidadCompra: '', contenido: '' });
                    return;
                  }
                  setInsNuevo({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
                  const c = catalogo.find((x) => x.id === e.target.value);
                  setInsForm({
                    ...insForm,
                    id: e.target.value,
                    unidadCompra: c?.unidadCompra ?? '',
                    contenido: c?.equivalencia ? String(c.equivalencia) : '',
                  });
                }}
                className={`${inputCls} disabled:bg-neutral-100 disabled:text-neutral-600`}
              >
                <option value="">— elige el insumo —</option>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
                {!insEditando && <option value="__nuevo__">➕ No está en la lista…</option>}
              </select>

              {/* Dar de alta el insumo aquí mismo. Anotar que un proveedor
                  vende algo se hace al descubrirlo, y si obliga a salir a
                  Insumos primero, no se apunta nunca. */}
              {insNuevo.activo && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-neutral-700">
                    Se da de alta en tu catálogo, <b>guardado y sin usarse</b>: queda listo para
                    cuando lo ocupes en una receta.
                  </p>
                  <input
                    value={insNuevo.nombre}
                    onChange={(e) => setInsNuevo({ ...insNuevo, nombre: e.target.value })}
                    placeholder="Cómo se llama (ej. Jarabe de agave)"
                    className={inputCls}
                    autoFocus
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={insNuevo.unidadReceta}
                      onChange={(e) => setInsNuevo({ ...insNuevo, unidadReceta: e.target.value })}
                      placeholder="En qué lo piden las recetas (g, ml, pieza)"
                      className={inputCls}
                    />
                    <input
                      value={insNuevo.categoria}
                      onChange={(e) => setInsNuevo({ ...insNuevo, categoria: e.target.value })}
                      placeholder="Categoría (opcional)"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              <label className="block text-sm font-semibold text-neutral-800">
                Marca <span className="font-normal text-neutral-600">(o &ldquo;No aplica&rdquo;)</span>
              </label>
              <input
                value={insForm.marca}
                onChange={(e) => setInsForm({ ...insForm, marca: e.target.value })}
                placeholder="Ej. Hellmann's"
                className={inputCls}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-neutral-800">¿Cómo viene?</label>
                  <input
                    value={insForm.unidadCompra}
                    onChange={(e) => setInsForm({ ...insForm, unidadCompra: e.target.value })}
                    placeholder="paquete, bote…"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-800">
                    ¿Cuánto trae? {ins?.unidadReceta && `(${ins.unidadReceta})`}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={insForm.contenido}
                    onChange={(e) => setInsForm({ ...insForm, contenido: e.target.value })}
                    placeholder="2000"
                    className={inputCls}
                  />
                </div>
              </div>

              <label className="block text-sm font-semibold text-neutral-800">
                ¿En cuánto lo tienen? <span className="font-normal text-neutral-600">(opcional)</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={insForm.ultimoPrecio}
                onChange={(e) => setInsForm({ ...insForm, ultimoPrecio: e.target.value })}
                placeholder="lo que cuesta uno"
                className={inputCls}
              />

              {porUnidad > 0 && ins && (
                <p className="text-sm font-semibold text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">
                  Sale a {porPieza(porUnidad)} por {ins.unidadReceta} — con eso lo comparas contra
                  los otros proveedores.
                </p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={async () => {
                  const comun = {
                    marca: insForm.marca,
                    unidadCompra: insForm.unidadCompra,
                    contenido: insForm.contenido,
                    ultimoPrecio: insForm.ultimoPrecio,
                    proveedor: agregarA.nombre,
                    ...(insNuevo.activo
                      ? {
                          nombreNuevo: insNuevo.nombre,
                          unidadReceta: insNuevo.unidadReceta,
                          categoria: insNuevo.categoria,
                        }
                      : {}),
                  };
                  const ok = await pedir(
                    '/api/admin/presentaciones',
                    insEditando ? 'PATCH' : 'POST',
                    insEditando
                      ? { id: insEditando.idPresentacion, ...comun }
                      : { idBiblioteca: insForm.id, ...comun }
                  );
                  if (!ok) return;
                  setAgregarA(null);
                  setInsEditando(null);
                  setInsNuevo({ activo: false, nombre: '', unidadReceta: '', categoria: '' });
                }}
                disabled={
                  ocupado ||
                  (insNuevo.activo ? !insNuevo.nombre.trim() : !insForm.id) ||
                  contenido <= 0
                }
                className="w-full bg-marron text-white font-bold py-3.5 rounded-xl active:scale-95 disabled:opacity-50"
              >
                {ocupado
                  ? 'Guardando…'
                  : insNuevo.activo && !insNuevo.nombre.trim()
                    ? 'Ponle nombre al insumo'
                    : !insNuevo.activo && !insForm.id
                      ? 'Elige el insumo'
                      : contenido <= 0
                        ? 'Falta cuánto trae'
                        : 'Guardar'}
              </button>

              {/* Dos formas de quitarla, y no son lo mismo: esconderla
                  conserva su historial de precios; borrarla solo aplica
                  cuando fue un error de captura y no tiene compras. */}
              {insEditando && (
                <>
                  <button
                    onClick={async () => {
                      const ok = await pedir('/api/admin/presentaciones', 'PATCH', {
                        id: insEditando.idPresentacion,
                        activa: !insEditando.activa,
                      });
                      if (!ok) return;
                      setAgregarA(null);
                      setInsEditando(null);
                    }}
                    disabled={ocupado}
                    className="w-full bg-neutral-100 text-neutral-800 font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
                  >
                    {insEditando.activa ? 'Ya no la compro así' : 'Volver a comprarla así'}
                  </button>
                  <button
                    onClick={async () => {
                      const url =
                        '/api/admin/presentaciones?id=' +
                        encodeURIComponent(insEditando.idPresentacion);
                      const ok = await pedir(url, 'DELETE');
                      if (!ok) return;
                      setAgregarA(null);
                      setInsEditando(null);
                    }}
                    disabled={ocupado}
                    className="w-full bg-red-50 text-red-700 font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
                  >
                    🗑️ Lo anoté por error, bórralo
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Alta y edición comparten formulario: piden lo mismo */}
      {(nuevo || editando) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90%] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">
                {nuevo ? 'Nuevo proveedor' : `Editar ${editando?.nombre}`}
              </h3>
              <button
                onClick={() => {
                  setNuevo(false);
                  setEditando(null);
                  setError('');
                }}
                className="text-neutral-600 text-xl leading-none px-2"
              >
                ✕
              </button>
            </div>

            <label className="block text-sm font-semibold text-neutral-800">Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej. Central de Abastos"
              className={inputCls}
              autoFocus
            />

            <label className="block text-sm font-semibold text-neutral-800">
              Teléfono <span className="font-normal text-neutral-600">(opcional)</span>
            </label>
            <input
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="Para hablarle desde aquí"
              className={inputCls}
            />

            <label className="block text-sm font-semibold text-neutral-800">
              Con quién tratas <span className="font-normal text-neutral-600">(opcional)</span>
            </label>
            <input
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              placeholder="Ej. Don Beto, bodega 12"
              className={inputCls}
            />

            <label className="block text-sm font-semibold text-neutral-800">
              Dónde está <span className="font-normal text-neutral-600">(opcional)</span>
            </label>
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="La dirección, o pega el enlace de Google Maps"
              className={inputCls}
            />
            <p className="text-xs text-neutral-600 -mt-1">
              {form.direccion.trim()
                ? etiquetaMapa(form.direccion) === 'Ver ubicación'
                  ? 'Es un enlace de Maps: se abrirá tal cual, en el punto exacto.'
                  : 'Se buscará en Google Maps tal como lo escribiste.'
                : 'Puedes escribir la dirección o pegar el enlace que comparte Google Maps; las dos sirven.'}
            </p>
            {form.direccion.trim() && (
              <a
                href={enlaceMapa(form.direccion)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-bold text-marron underline"
              >
                📍 Probar en Maps
              </a>
            )}

            <label className="block text-sm font-semibold text-neutral-800">
              Notas <span className="font-normal text-neutral-600">(opcional)</span>
            </label>
            <input
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Ej. abre de 5 a 11, no da factura"
              className={inputCls}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={async () => {
                const ok = nuevo
                  ? await guardar('POST', form)
                  : await guardar('PATCH', { id: editando?.id, ...form });
                if (ok) {
                  setNuevo(false);
                  setEditando(null);
                }
              }}
              disabled={ocupado || !form.nombre.trim()}
              className="w-full bg-marron text-white font-bold py-3.5 rounded-xl active:scale-95 disabled:opacity-50"
            >
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>

            {editando && (
              <button
                onClick={async () => {
                  const ok = await guardar('PATCH', {
                    id: editando.id,
                    activo: !editando.activo,
                  });
                  if (ok) setEditando(null);
                }}
                disabled={ocupado}
                className="w-full bg-neutral-100 text-neutral-800 font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
              >
                {editando.activo ? 'Ya no le compro' : 'Volver a comprarle'}
              </button>
            )}
            <p className="text-xs text-neutral-600 text-center">
              No se borran: su historial de compras y precios se conserva para poder comparar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
