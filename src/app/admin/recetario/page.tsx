'use client';

/**
 * Recetario: qué lleva cada producto y cuánto cuesta hacerlo.
 *
 * Sustituye a editar la hoja Catalogo a mano. Las dos reglas que evitan
 * que se vuelva a ensuciar:
 *  · el insumo se elige de una lista, no se escribe
 *  · la unidad la pone el insumo, no se teclea
 */

import { useCallback, useEffect, useState } from 'react';

interface LineaReceta {
  id: string;
  idBiblioteca: string;
  insumo: string;
  unidad: string;
  cantidad: number;
  merma: string;
  nota: string;
  costo: number | null;
  huerfano: boolean;
}

interface ProductoReceta {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  emoji: string;
  lineas: LineaReceta[];
  costoTotal: number | null;
}

interface InsumoOpcion {
  id: string;
  nombre: string;
  unidad: string;
  categoria: string;
  tienePrecio: boolean;
}

export default function RecetarioPage() {
  const [items, setItems] = useState<ProductoReceta[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloSinReceta, setSoloSinReceta] = useState(false);

  // Alta de un insumo dentro de una receta
  const [nuevoInsumo, setNuevoInsumo] = useState('');
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const res = await fetch('/api/admin/recetario');
    const data = await res.json();
    setItems(data.items ?? []);
    setInsumos(data.insumos ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function llamar(metodo: string, cuerpo?: unknown, query = '') {
    setOcupado(true);
    setError('');
    const res = await fetch(`/api/admin/recetario${query}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar');
      return false;
    }
    await cargar();
    return true;
  }

  async function agregar(idProducto: string) {
    if (!nuevoInsumo) return setError('Elige un insumo');
    const cant = parseFloat(nuevaCantidad.replace(',', '.'));
    if (isNaN(cant) || cant <= 0) return setError('Escribe cuánto lleva');
    const ok = await llamar('POST', { idProducto, idBiblioteca: nuevoInsumo, cantidad: cant });
    if (ok) {
      setNuevoInsumo('');
      setNuevaCantidad('');
    }
  }

  async function editarCantidad(l: LineaReceta) {
    const valor = prompt(`¿Cuánto ${l.insumo} lleva? (en ${l.unidad})`, String(l.cantidad));
    if (valor === null) return;
    const cant = parseFloat(valor.replace(',', '.'));
    if (isNaN(cant) || cant <= 0) return alert('Cantidad inválida');
    await llamar('PATCH', { id: l.id, cantidad: cant });
  }

  async function quitar(l: LineaReceta) {
    if (!confirm(`¿Quitar ${l.insumo} de esta receta?`)) return;
    await llamar('DELETE', undefined, `?id=${encodeURIComponent(l.id)}`);
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = items
    .filter((p) => (soloSinReceta ? p.lineas.length === 0 : true))
    .filter(
      (p) =>
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.lineas.some((l) => l.insumo.toLowerCase().includes(q))
    );

  const sinReceta = items.filter((p) => p.lineas.length === 0).length;
  const porRevisar = items.reduce((n, p) => n + p.lineas.filter((l) => l.nota).length, 0);

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando recetario…</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-neutral-700">
          Qué lleva cada producto. El insumo se elige de tu biblioteca y la unidad la pone él, para
          que las cuentas de stock y costo siempre cuadren.
        </p>
      </div>

      {(sinReceta > 0 || porRevisar > 0) && (
        <div className="flex flex-wrap gap-2">
          {sinReceta > 0 && (
            <button
              onClick={() => setSoloSinReceta((v) => !v)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                soloSinReceta ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              ⚠️ {sinReceta} sin receta
            </button>
          )}
          {porRevisar > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600">
              📝 {porRevisar} renglones marcados para revisar
            </span>
          )}
        </div>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto o insumo…"
        className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-marron text-neutral-900"
      />

      <div className="space-y-3 text-neutral-900">
        {visibles.map((p) => {
          const activo = abierto === p.id;
          const margen = p.costoTotal !== null && p.precio > 0
            ? Math.round(((p.precio - p.costoTotal) / p.precio) * 100)
            : null;

          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100">
              <button
                onClick={() => {
                  setAbierto(activo ? null : p.id);
                  setNuevoInsumo('');
                  setNuevaCantidad('');
                  setError('');
                }}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <span className="text-2xl shrink-0">{p.emoji || '🍽️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-900 truncate">{p.nombre}</p>
                  <p className="text-xs text-neutral-600">
                    {p.lineas.length === 0 ? (
                      <span className="text-amber-700 font-semibold">Sin receta</span>
                    ) : (
                      `${p.lineas.length} insumo${p.lineas.length === 1 ? '' : 's'}`
                    )}
                    {' · '}
                    {p.categoria}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-neutral-900">${p.precio.toFixed(2)}</p>
                  {p.costoTotal !== null ? (
                    <p className="text-[11px] text-neutral-700">
                      cuesta ${p.costoTotal.toFixed(2)}
                      {margen !== null && (
                        <span className={margen < 30 ? 'text-red-600 font-semibold' : 'text-green-700'}>
                          {' '}· {margen}%
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-neutral-600">costo incompleto</p>
                  )}
                </div>
                <span className="text-neutral-600 shrink-0">{activo ? '▴' : '▾'}</span>
              </button>

              {activo && (
                <div className="border-t border-neutral-100 p-4 space-y-2">
                  {p.lineas.length === 0 && (
                    <p className="text-sm text-neutral-600">
                      Todavía no tiene ingredientes. Agrega el primero abajo.
                    </p>
                  )}

                  {p.lineas.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 py-1.5 border-b border-neutral-50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900">
                          {l.insumo}
                          {l.huerfano && <span className="text-red-600"> (falta el insumo)</span>}
                        </p>
                        {l.nota && <p className="text-[11px] text-amber-700">📝 {l.nota}</p>}
                      </div>
                      <span className="text-sm font-semibold text-neutral-900 whitespace-nowrap">
                        {l.cantidad} {l.unidad}
                      </span>
                      <span className="text-xs text-neutral-600 w-16 text-right shrink-0">
                        {l.costo !== null ? `$${l.costo.toFixed(2)}` : '—'}
                      </span>
                      <button
                        onClick={() => editarCantidad(l)}
                        disabled={ocupado}
                        className="text-xs font-semibold text-black bg-neutral-200 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => quitar(l)}
                        disabled={ocupado}
                        className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <select
                      value={nuevoInsumo}
                      onChange={(e) => setNuevoInsumo(e.target.value)}
                      className="flex-1 min-w-[160px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                    >
                      <option value="">+ Agregar insumo…</option>
                      {insumos
                        .filter((i) => !p.lineas.some((l) => l.idBiblioteca === i.id))
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} ({i.unidad}){i.tienePrecio ? '' : ' — sin precio'}
                          </option>
                        ))}
                    </select>
                    <input
                      value={nuevaCantidad}
                      onChange={(e) => setNuevaCantidad(e.target.value)}
                      inputMode="decimal"
                      placeholder="Cantidad"
                      className="w-28 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                    />
                    <span className="self-center text-sm text-neutral-700 text-neutral-900">
                      {insumos.find((i) => i.id === nuevoInsumo)?.unidad || ''}
                    </span>
                    <button
                      onClick={() => agregar(p.id)}
                      disabled={ocupado}
                      className="bg-marron text-white text-sm font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-50"
                    >
                      Agregar
                    </button>
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              )}
            </div>
          );
        })}

        {visibles.length === 0 && (
          <p className="text-center text-neutral-600 py-8">Ningún producto coincide.</p>
        )}
      </div>
    </div>
  );
}
