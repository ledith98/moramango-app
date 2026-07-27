'use client';

/**
 * Caja: abrir con un fondo, y al cerrar contar el efectivo para ver si
 * cuadra contra lo esperado (fondo + ventas en efectivo del día).
 */

import { useCallback, useEffect, useState } from 'react';

interface EstadoCaja {
  fecha: string;
  abierta: boolean;
  fondoApertura: number | null;
  horaApertura: string;
  ventasEfectivo: number;
  esperado: number | null;
  cerrada: boolean;
  efectivoContado: number | null;
  horaCorte: string;
  diferencia: number | null;
  notas: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CajaPage() {
  const [caja, setCaja] = useState<EstadoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const res = await fetch('/api/admin/caja');
    const data = await res.json();
    setCaja(data);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/caja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json();
    setOcupado(false);
    if (!res.ok) {
      setError(data.error || 'No se pudo guardar');
      return;
    }
    setCaja(data.estado);
  }

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando caja…</p>;
  if (!caja) return null;

  return (
    <div className="space-y-5 max-w-xl">
      <p className="text-sm text-neutral-700">
        Corte de caja de hoy. Abre con el fondo que dejas en el cajón; al cerrar, cuenta el efectivo
        y la app te dice si cuadra.
      </p>

      {/* Paso 1: abrir */}
      {!caja.abierta ? (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
          <h2 className="font-bold text-neutral-900">1. Abrir caja</h2>
          <label className="block text-sm font-semibold text-neutral-700">
            Fondo de apertura (con cuánto empiezas)
          </label>
          <div className="flex flex-wrap gap-2">
            {[300, 500, 800, 1000].map((m) => (
              <button
                key={m}
                onClick={() => setFondo(String(m))}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 active:scale-95"
              >
                {money(m)}
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
            placeholder="Ej. 500"
            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => accion({ accion: 'abrir', fondo })}
            disabled={ocupado || !fondo}
            className="w-full bg-marron text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
          >
            Abrir caja de hoy
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
          {/* Resumen del día */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-neutral-900">Caja de hoy</h2>
            <span className="text-xs text-neutral-600">Abierta {caja.horaApertura}</span>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-700">Fondo de apertura</dt>
              <dd className="font-semibold text-neutral-900 tabular-nums">
                {money(caja.fondoApertura ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-700">Ventas en efectivo</dt>
              <dd className="font-semibold text-neutral-900 tabular-nums">
                {money(caja.ventasEfectivo)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <dt className="font-bold text-neutral-900">Debería haber</dt>
              <dd className="font-bold text-neutral-900 tabular-nums">{money(caja.esperado ?? 0)}</dd>
            </div>
          </dl>

          {/* Paso 2: corte */}
          {!caja.cerrada ? (
            <div className="border-t border-neutral-100 pt-3 space-y-3">
              <h3 className="font-bold text-neutral-900">2. Hacer el corte</h3>
              <label className="block text-sm font-semibold text-neutral-700">
                ¿Cuánto efectivo hay en el cajón ahora?
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                placeholder="Cuenta el cajón y escribe el total"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
              />
              {/* Previsualización de la diferencia mientras escribe */}
              {contado !== '' && caja.esperado !== null && (
                <PreviewDiferencia
                  diferencia={Math.round((parseFloat(contado) - caja.esperado) * 100) / 100}
                />
              )}
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Nota (opcional): motivo de un faltante, etc."
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={() => accion({ accion: 'corte', contado, notas })}
                disabled={ocupado || contado === ''}
                className="w-full bg-marron text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
              >
                Cerrar caja y guardar corte
              </button>
            </div>
          ) : (
            <div className="border-t border-neutral-100 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-700">Efectivo contado</span>
                <span className="font-semibold text-neutral-900 tabular-nums">
                  {money(caja.efectivoContado ?? 0)}
                </span>
              </div>
              <ResultadoCorte diferencia={caja.diferencia ?? 0} hora={caja.horaCorte} />
              {caja.notas && <p className="text-xs text-neutral-600">📝 {caja.notas}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewDiferencia({ diferencia }: { diferencia: number }) {
  if (Math.abs(diferencia) < 0.01) {
    return <p className="text-sm font-semibold text-green-700">Cuadra exacto ✅</p>;
  }
  const falta = diferencia < 0;
  return (
    <p className={`text-sm font-semibold ${falta ? 'text-red-600' : 'text-amber-700'}`}>
      {falta ? 'Faltarían' : 'Sobrarían'} ${Math.abs(diferencia).toFixed(2)}
    </p>
  );
}

function ResultadoCorte({ diferencia, hora }: { diferencia: number; hora: string }) {
  const cuadra = Math.abs(diferencia) < 0.01;
  const falta = diferencia < 0;
  const bg = cuadra ? 'bg-green-50 border-green-200' : falta ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const texto = cuadra ? 'text-green-800' : falta ? 'text-red-700' : 'text-amber-800';
  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between ${bg}`}>
      <div>
        <p className={`font-bold ${texto}`}>
          {cuadra ? '✅ La caja cuadra' : falta ? '⚠️ Falta dinero' : '⚠️ Sobra dinero'}
        </p>
        <p className="text-xs text-neutral-600">Corte cerrado {hora}</p>
      </div>
      {!cuadra && (
        <span className={`text-2xl font-bold tabular-nums ${texto}`}>
          {falta ? '−' : '+'}${Math.abs(diferencia).toFixed(2)}
        </span>
      )}
    </div>
  );
}
