'use client';

/**
 * Ajustes del negocio: reglas que la dueña puede cambiar sin tocar código.
 */

import { useCallback, useEffect, useState } from 'react';

interface Producto {
  nombre: string;
  precio: number;
  categoria: string;
}

/** Igual que en el servidor: comparar sin acentos ni mayúsculas. */
const clave = (c: string) =>
  (c || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function AjustesPage() {
  const [tope, setTope] = useState('');
  const [topeGuardado, setTopeGuardado] = useState(35);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [orden, setOrden] = useState<string[]>([]);
  const [ordenGuardado, setOrdenGuardado] = useState<string[]>([]);
  const [guardandoOrden, setGuardandoOrden] = useState(false);
  const [okOrden, setOkOrden] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const [rA, rP] = await Promise.all([
      fetch('/api/admin/ajustes'),
      fetch('/api/admin/productos'),
    ]);
    const a = await rA.json();
    const p = await rP.json();
    if (a?.topeArticuloGratis) {
      setTope(String(a.topeArticuloGratis));
      setTopeGuardado(a.topeArticuloGratis);
    }
    const lista: Producto[] = (p.productos || [])
      .filter((x: Record<string, string>) => (x.Eliminado || '').toUpperCase() !== 'TRUE')
      .map((x: Record<string, string>) => ({
        nombre: x.Nombre || '',
        precio: parseFloat(x.Precio_Venta) || 0,
        categoria: (x['Categoría'] || x.Categoria || 'Otros').trim() || 'Otros',
      }));
    setProductos(lista);

    // El orden guardado manda, pero la lista que se ve son los grupos que
    // de verdad existen hoy: si se crea uno nuevo aparece al final, y si se
    // deja de usar uno deja de estorbar.
    const existentes = Array.from(new Set(lista.map((x) => x.categoria)));
    const guardado: string[] = a?.ordenCategorias || [];
    const final = [
      ...guardado.filter((c) => existentes.some((e) => clave(e) === clave(c))),
      ...existentes.filter((e) => !guardado.some((c) => clave(c) === clave(e))),
    ];
    setOrden(final);
    setOrdenGuardado(final);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar() {
    const n = parseFloat(tope.replace(',', '.'));
    if (isNaN(n) || n <= 0) {
      setError('Escribe un monto mayor a 0');
      return;
    }
    setGuardando(true);
    setError('');
    const res = await fetch('/api/admin/ajustes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topeArticuloGratis: n }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar');
      return;
    }
    setTopeGuardado(data.ajustes?.topeArticuloGratis ?? n);
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  }

  function mover(i: number, hacia: -1 | 1) {
    const j = i + hacia;
    if (j < 0 || j >= orden.length) return;
    const copia = [...orden];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setOrden(copia);
  }

  async function guardarOrden() {
    setGuardandoOrden(true);
    setError('');
    const res = await fetch('/api/admin/ajustes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordenCategorias: orden }),
    });
    const data = await res.json();
    setGuardandoOrden(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar el orden');
      return;
    }
    setOrdenGuardado(orden);
    setOkOrden(true);
    setTimeout(() => setOkOrden(false), 2500);
  }

  const ordenCambiado = orden.join('|') !== ordenGuardado.join('|');
  const cuantos = (cat: string) =>
    productos.filter((p) => clave(p.categoria) === clave(cat)).length;

  // Vista previa con el valor que se está escribiendo, no el guardado
  const topeVista = parseFloat(tope.replace(',', '.')) || 0;
  const entran = productos
    .filter((p) => p.precio > 0 && p.precio <= topeVista)
    .sort((a, b) => a.precio - b.precio);

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando ajustes…</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm text-neutral-700">
        Reglas del negocio que puedes cambiar tú, sin que nadie toque la aplicación.
      </p>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-neutral-900">📋 Orden de los grupos en la tienda</h2>
          <p className="text-sm text-neutral-700 mt-1">
            Así los ve el cliente al entrar, de arriba hacia abajo. Sube lo que quieras que vean
            primero.
          </p>
        </div>

        <ol className="space-y-2">
          {orden.map((cat, i) => (
            <li
              key={cat}
              className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5"
            >
              <span className="w-6 h-6 shrink-0 rounded-full bg-marron text-white text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 truncate">{cat}</p>
                <p className="text-xs text-neutral-600">
                  {cuantos(cat)} producto{cuantos(cat) === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${cat}`}
                  className="w-9 h-9 rounded-lg bg-white border border-neutral-300 text-neutral-900 font-bold active:scale-95 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => mover(i, 1)}
                  disabled={i === orden.length - 1}
                  aria-label={`Bajar ${cat}`}
                  className="w-9 h-9 rounded-lg bg-white border border-neutral-300 text-neutral-900 font-bold active:scale-95 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2">
          <button
            onClick={guardarOrden}
            disabled={guardandoOrden || !ordenCambiado}
            className="bg-marron text-white font-semibold px-5 py-3 rounded-xl active:scale-95 disabled:opacity-50"
          >
            {guardandoOrden ? 'Guardando…' : okOrden ? '✅ Guardado' : 'Guardar orden'}
          </button>
          {ordenCambiado && (
            <button
              onClick={() => setOrden(ordenGuardado)}
              className="text-sm font-semibold text-neutral-700 px-3 py-3"
            >
              Deshacer
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-neutral-900">🎁 Artículo gratis (décima compra)</h2>
          <p className="text-sm text-neutral-700 mt-1">
            Al llegar a 10 compras, el cliente elige un producto gratis de este precio o menos. En
            el punto de venta se descuenta solo al elegirlo.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-neutral-700">Precio máximo</label>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-neutral-700">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              value={tope}
              onChange={(e) => setTope(e.target.value)}
              className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-none focus:border-marron"
            />
            <button
              onClick={guardar}
              disabled={guardando || tope === String(topeGuardado)}
              className="bg-marron text-white font-semibold px-5 py-3 rounded-xl active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {guardando ? 'Guardando…' : ok ? '✅ Guardado' : 'Guardar'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="border-t border-neutral-100 pt-3">
          <p className="text-xs font-semibold text-neutral-700 mb-2">
            Con ${topeVista || 0} el cliente podría elegir entre {entran.length} producto
            {entran.length === 1 ? '' : 's'}:
          </p>
          {entran.length === 0 ? (
            <p className="text-sm text-amber-700">
              Ningún producto cuesta ${topeVista || 0} o menos. Sube el monto o el beneficio no
              podrá usarse.
            </p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {entran.map((p) => (
                <li key={p.nombre} className="flex justify-between text-sm">
                  <span className="text-neutral-900 truncate">{p.nombre}</span>
                  <span className="text-neutral-700 tabular-nums shrink-0 ml-2">
                    ${p.precio.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
        <h2 className="font-bold text-neutral-900 mb-2">⭐ Cómo funciona la lealtad</h2>
        <ul className="text-sm text-neutral-700 space-y-1.5">
          <li>
            <b>Cada compra</b> suma 1 al avance del cliente (las canceladas no cuentan).
          </li>
          <li>
            <b>A las 5 compras</b> gana 15% de descuento. Al usarlo, sigue avanzando.
          </li>
          <li>
            <b>A las 10 compras</b> gana un artículo gratis. Al usarlo, su avance vuelve a cero.
          </li>
        </ul>
      </div>
    </div>
  );
}
