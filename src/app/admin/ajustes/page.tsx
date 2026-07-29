'use client';

/**
 * Ajustes del negocio: reglas que la dueña puede cambiar sin tocar código.
 */

import { useCallback, useEffect, useState } from 'react';

interface Producto {
  nombre: string;
  precio: number;
}

export default function AjustesPage() {
  const [tope, setTope] = useState('');
  const [topeGuardado, setTopeGuardado] = useState(35);
  const [productos, setProductos] = useState<Producto[]>([]);
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
    setProductos(
      (p.productos || [])
        .filter((x: Record<string, string>) => (x.Eliminado || '').toUpperCase() !== 'TRUE')
        .map((x: Record<string, string>) => ({
          nombre: x.Nombre || '',
          precio: parseFloat(x.Precio_Venta) || 0,
        }))
    );
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
