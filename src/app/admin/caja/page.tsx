'use client';

/**
 * Caja: abrir con un fondo, y al cerrar contar el efectivo para ver si
 * cuadra contra lo esperado (fondo + ventas en efectivo del día).
 */

import { useCallback, useEffect, useState } from 'react';

interface MovimientoCaja {
  fila: number;
  hora: string;
  tipo: 'Salida' | 'Entrada';
  monto: number;
  motivo: string;
  /** Insumo al que se fue el dinero; vacio si fue otra cosa */
  idInsumo?: string;
}

interface EstadoCaja {
  fecha: string;
  abierta: boolean;
  fondoApertura: number | null;
  horaApertura: string;
  ventasEfectivo: number;
  salidas: number;
  entradas: number;
  esperado: number | null;
  movimientos?: MovimientoCaja[];
  /** Insumos en uso, para decir en que se fue el dinero */
  insumos?: { id: string; nombre: string }[];
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
  const [tipoMov, setTipoMov] = useState<'Salida' | 'Entrada'>('Salida');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');
  /** Insumo al que se fue el dinero; '' = no fue un insumo */
  const [insumoMov, setInsumoMov] = useState('');
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
      return false;
    }
    setCaja(data.estado);
    return true;
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
              <dt className="text-neutral-700">+ Ventas en efectivo</dt>
              <dd className="font-semibold text-neutral-900 tabular-nums">
                {money(caja.ventasEfectivo)}
              </dd>
            </div>
            {caja.entradas > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-700">+ Otras entradas</dt>
                <dd className="font-semibold text-green-700 tabular-nums">
                  {money(caja.entradas)}
                </dd>
              </div>
            )}
            {caja.salidas > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-700">− Dinero que se sacó</dt>
                <dd className="font-semibold text-red-700 tabular-nums">
                  −{money(caja.salidas)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <dt className="font-bold text-neutral-900">Debería haber</dt>
              <dd className="font-bold text-neutral-900 tabular-nums">{money(caja.esperado ?? 0)}</dd>
            </div>
          </dl>

          {/* ── Entradas y salidas de efectivo ──
              Sacar dinero del cajón para comprar limones no es un
              faltante, pero sin anotarlo el corte lo cuenta como tal y
              deja de ser creíble. */}
          <div className="border-t border-neutral-100 pt-3 space-y-3">
            <div>
              <h3 className="font-bold text-neutral-900">💵 Entradas y salidas de efectivo</h3>
              <p className="text-xs text-neutral-700 mt-0.5">
                Anota aquí el dinero que sacas del cajón para comprar algo, o el que metes sin ser
                una venta. Se descuenta (o se suma) de lo que debería haber.
              </p>
            </div>

            <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit">
              {(
                [
                  ['Salida', '↑ Saqué dinero'],
                  ['Entrada', '↓ Metí dinero'],
                ] as const
              ).map(([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setTipoMov(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    tipoMov === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-neutral-700">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={montoMov}
                  onChange={(e) => setMontoMov(e.target.value)}
                  placeholder="0"
                  className="w-24 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
                />
              </div>
              <input
                value={motivoMov}
                onChange={(e) => setMotivoMov(e.target.value)}
                placeholder={
                  tipoMov === 'Salida' ? 'Ej. compré limones' : 'Ej. cambio que traía'
                }
                className="flex-1 min-w-[160px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
              />
              <button
                onClick={async () => {
                  const ok = await accion({
                    accion: 'movimiento',
                    tipo: tipoMov,
                    monto: montoMov,
                    motivo: motivoMov,
                    idInsumo: insumoMov,
                  });
                  if (ok) {
                    setMontoMov('');
                    setMotivoMov('');
                    setInsumoMov('');
                  }
                }}
                disabled={ocupado}
                className="bg-marron text-white font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-50"
              >
                Anotar
              </button>
            </div>

            {/* ¿En qué se fue? Si fue un insumo, el movimiento queda ligado
                a él. La compra NO se registra aquí: eso necesita cuántos
                kilos llegaron, que esta pantalla no pregunta. Se ofrece el
                atajo para ir a capturarla, y así no hay dos caminos que
                creen el mismo registro por separado. */}
            {tipoMov === 'Salida' && (caja.insumos?.length ?? 0) > 0 && (
              <div>
                <label className="block text-sm font-semibold text-neutral-800 mb-1">
                  ¿Fue para un insumo?
                </label>
                <select
                  value={insumoMov}
                  onChange={(e) => {
                    setInsumoMov(e.target.value);
                    // El motivo se rellena solo con el nombre, para no
                    // escribirlo dos veces
                    const n = caja.insumos?.find((i) => i.id === e.target.value)?.nombre;
                    if (n && !motivoMov.trim()) setMotivoMov(`Compré ${n}`);
                  }}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-marron"
                >
                  <option value="">No, fue otra cosa</option>
                  {caja.insumos?.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
                {insumoMov && (
                  <p className="text-xs text-neutral-700 mt-1.5">
                    Queda ligado a ese insumo. Para que además le sume la existencia,{' '}
                    <a href="/admin/insumos" className="font-bold underline text-marron">
                      registra la compra en Insumos
                    </a>{' '}
                    y ahí elige <b>&ldquo;no lo anotes&rdquo;</b> — el dinero ya quedó aquí.
                  </p>
                )}
              </div>
            )}

            {caja.movimientos && caja.movimientos.length > 0 && (
              <ul className="space-y-1.5">
                {caja.movimientos.map((m) => (
                  <li
                    key={m.fila}
                    className="flex items-center gap-2 text-sm bg-neutral-50 rounded-xl px-3 py-2"
                  >
                    <span
                      className={`font-bold tabular-nums shrink-0 ${
                        m.tipo === 'Salida' ? 'text-red-700' : 'text-green-700'
                      }`}
                    >
                      {m.tipo === 'Salida' ? '−' : '+'}
                      {money(m.monto)}
                    </span>
                    <span className="flex-1 min-w-0 text-neutral-800 truncate">{m.motivo}</span>
                    <span className="text-[11px] text-neutral-600 shrink-0">{m.hora}</span>
                    <button
                      onClick={() => accion({ accion: 'borrarMovimiento', fila: m.fila })}
                      disabled={ocupado}
                      title="Borrar este movimiento"
                      className="shrink-0 w-7 h-7 rounded-lg bg-white text-neutral-600 font-bold active:scale-90 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
