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

interface OpcionPrecio {
  idProveedor: string;
  proveedor: string;
  ultimoPrecio: number;
  promedio: number;
  compras: number;
  ultimaFecha: string;
  esElMasBarato: boolean;
}

interface InsumoDeProveedor {
  id: string;
  nombre: string;
  ultimoPrecio: number;
  esElMasBarato: boolean;
  cuantosLoVenden: number;
}

interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  notas: string;
  activo: boolean;
  compras: number;
  gastado: number;
  ultimaCompra: string;
  insumos: InsumoDeProveedor[];
}

interface Comparable {
  id: string;
  nombre: string;
  opciones: OpcionPrecio[];
  ahorro: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const inputCls =
  'w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron';

const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function ProveedoresPage() {
  const [pestana, setPestana] = useState<'directorio' | 'comparar'>('directorio');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [comparables, setComparables] = useState<Comparable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', contacto: '', telefono: '', notas: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch('/api/admin/proveedores');
    const d = await r.json();
    if (r.ok) {
      setProveedores(d.proveedores ?? []);
      setComparables(d.comparables ?? []);
    } else {
      setError(d.error || 'No se pudo cargar');
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/proveedores', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar');
      return false;
    }
    await cargar();
    return true;
  }

  const visibles = proveedores.filter((p) => {
    const q = sinAcentos(busqueda);
    if (!q) return true;
    return (
      sinAcentos(p.nombre).includes(q) || p.insumos.some((i) => sinAcentos(i.nombre).includes(q))
    );
  });

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
            setForm({ nombre: '', contacto: '', telefono: '', notas: '' });
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
                    </div>
                    <button
                      onClick={() => {
                        setEditando(p);
                        setForm({
                          nombre: p.nombre,
                          contacto: p.contacto,
                          telefono: p.telefono,
                          notas: p.notas,
                        });
                      }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 active:scale-95 shrink-0"
                    >
                      Editar
                    </button>
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
                            <span className="text-neutral-800 truncate">{i.nombre}</span>
                            <span className="shrink-0 tabular-nums">
                              <span className="font-semibold text-neutral-900">
                                {money(i.ultimoPrecio)}
                              </span>
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
            El precio es <b>por unidad de compra</b>, que es lo único comparable entre lugares.
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
                        te ahorras {money(c.ahorro)} por unidad
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
                            {o.compras} compra{o.compras === 1 ? '' : 's'} · promedio{' '}
                            {money(o.promedio)}
                          </span>
                        </span>
                        <span
                          className={`font-bold tabular-nums shrink-0 ${
                            o.esElMasBarato ? 'text-green-800' : 'text-neutral-900'
                          }`}
                        >
                          {money(o.ultimoPrecio)}
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
