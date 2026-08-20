'use client';

/**
 * Dinero: el cajón y la cuenta, en un solo lugar.
 *
 * Vivían en dos pantallas separadas y compartían más de lo que las
 * distinguía — sobre todo el formulario de "anotar un movimiento", que
 * estaba duplicado y obligaba a decidir en cuál de las dos entrar antes
 * de saber a cuál pertenecía el movimiento.
 *
 * Lo que sí es distinto se conserva en pestañas: el cajón se cuenta a mano
 * y se cierra cada noche; la cuenta es un saldo que corre y se compara
 * contra la app del banco. Lo compartido —anotar entradas y salidas— vive
 * una sola vez, abajo, con un selector de bolsa.
 */

import { useCallback, useEffect, useState } from 'react';
import { rendimientoAnual } from '@/lib/rendimiento';

interface Movimiento {
  fila: number;
  fecha: string;
  hora: string;
  tipo: 'Salida' | 'Entrada' | 'Rendimiento';
  monto: number;
  motivo: string;
  cuenta: string;
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
  cerrada: boolean;
  efectivoContado: number | null;
  horaCorte: string;
  diferencia: number | null;
  notas: string;
  insumos?: { id: string; nombre: string }[];
}

interface PorMetodo {
  metodo: string;
  cobros: number;
  cobrado: number;
  comision: number;
  disponible: number;
}

interface EstadoCuenta {
  desde: string;
  hasta: string;
  dias: number;
  porMetodo: PorMetodo[];
  disponibleTotal: number;
  rendimiento: number;
  otrasEntradas: number;
  salidas: number;
  movimientoNeto: number;
  movimientos: Movimiento[];
  saldo: number | null;
  saldoFecha: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const ICONO_METODO: Record<string, string> = {
  Terminal: '💳',
  'Pago en línea': '🛍️',
  Transferencia: '📲',
};

function diaISO(atras = 0): string {
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() - atras * 86400000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

const ATAJOS = [
  { etiqueta: 'Este mes', rango: () => ({ desde: diaISO(0).slice(0, 8) + '01', hasta: diaISO(0) }) },
  { etiqueta: 'Últimos 7 días', rango: () => ({ desde: diaISO(6), hasta: diaISO(0) }) },
  { etiqueta: 'Últimos 30 días', rango: () => ({ desde: diaISO(29), hasta: diaISO(0) }) },
];

const inputCls =
  'bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron';

export default function DineroPage() {
  const [pestana, setPestana] = useState<'efectivo' | 'cuenta'>('efectivo');
  const [caja, setCaja] = useState<EstadoCaja | null>(null);
  const [cuenta, setCuenta] = useState<EstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  // Cajón
  const [fondo, setFondo] = useState('');
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');

  // Cuenta
  const [desde, setDesde] = useState(diaISO(0).slice(0, 8) + '01');
  const [hasta, setHasta] = useState(diaISO(0));
  const [saldo, setSaldo] = useState('');
  const [saldoTocado, setSaldoTocado] = useState(false);

  // Movimiento (compartido)
  const [bolsa, setBolsa] = useState<'Efectivo' | 'Digital'>('Efectivo');
  const [tipoMov, setTipoMov] = useState<'Salida' | 'Entrada' | 'Rendimiento'>('Salida');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');
  const [fechaMov, setFechaMov] = useState(diaISO(0));
  const [insumoMov, setInsumoMov] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rc, rq] = await Promise.all([
      fetch('/api/admin/caja'),
      fetch(`/api/admin/cuenta?${new URLSearchParams({ desde, hasta })}`),
    ]);
    const [dc, dq] = await Promise.all([rc.json(), rq.json()]);
    if (rc.ok) setCaja(dc);
    if (rq.ok) {
      setCuenta(dq);
      if (!saldoTocado && dq.saldo !== null && dq.saldo !== undefined) setSaldo(String(dq.saldo));
    }
    setCargando(false);
    // saldoTocado fuera de las dependencias a propósito: incluirlo
    // recargaría todo en cuanto se toca el campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Cualquier acción que cambie dinero: se recarga todo, porque un
   *  movimiento del cajón mueve el corte y uno de la cuenta el saldo. */
  async function accion(url: string, cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError('');
    const res = await fetch(url, {
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
    await cargar();
    return true;
  }

  if (cargando && !caja) {
    return <p className="text-neutral-700 animate-pulse">Cargando…</p>;
  }

  const tasa = cuenta
    ? rendimientoAnual(cuenta.rendimiento, parseFloat(saldo.replace(',', '.')), cuenta.dias)
    : null;

  return (
    <div className="space-y-5 max-w-xl">
      <p className="text-sm text-neutral-700">
        Todo tu dinero: el que está en el cajón y el que está en la cuenta. Las entradas y salidas
        se anotan abajo, en un solo lugar, digas de dónde salieron.
      </p>

      {/* Pestañas: lo que de verdad se comporta distinto */}
      <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-2xl w-fit max-w-full">
        {(
          [
            ['efectivo', '💵 El cajón (hoy)'],
            ['cuenta', '🏦 La cuenta'],
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

      {/* ───────────────────────── EL CAJÓN ───────────────────────── */}
      {pestana === 'efectivo' && caja && (
        <>
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
                className={`${inputCls} w-full`}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={() => accion('/api/admin/caja', { accion: 'abrir', fondo })}
                disabled={ocupado || !fondo}
                className="w-full bg-marron text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
              >
                Abrir caja de hoy
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
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
                  <dd className="font-bold text-neutral-900 tabular-nums">
                    {money(caja.esperado ?? 0)}
                  </dd>
                </div>
              </dl>

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
                    className={`${inputCls} w-full`}
                  />
                  {contado !== '' && caja.esperado !== null && (
                    <PreviewDiferencia
                      diferencia={Math.round((parseFloat(contado) - caja.esperado) * 100) / 100}
                    />
                  )}
                  <input
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Nota (opcional): motivo de un faltante, etc."
                    className={`${inputCls} w-full`}
                  />
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button
                    onClick={() => accion('/api/admin/caja', { accion: 'corte', contado, notas })}
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
        </>
      )}

      {/* ───────────────────────── LA CUENTA ───────────────────────── */}
      {pestana === 'cuenta' && cuenta && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((a) => {
                const r = a.rango();
                const activo = desde === r.desde && hasta === r.hasta;
                return (
                  <button
                    key={a.etiqueta}
                    onClick={() => {
                      setDesde(r.desde);
                      setHasta(r.hasta);
                    }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                      activo ? 'bg-marron text-white' : 'bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    {a.etiqueta}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-neutral-800">Del</label>
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                className={inputCls}
              />
              <label className="text-sm font-semibold text-neutral-800">al</label>
              <input
                type="date"
                value={hasta}
                min={desde}
                max={diaISO(0)}
                onChange={(e) => setHasta(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900">Lo que entró por ventas</h2>
            <p className="text-xs text-neutral-700 mt-0.5 mb-3">
              <b>Cobrado</b> es lo que pagó el cliente. <b>Disponible</b> es lo que quedó en la
              cuenta, ya sin comisión.
            </p>
            {cuenta.porMetodo.length === 0 ? (
              <p className="text-sm text-neutral-700">No hubo cobros a la cuenta en este periodo.</p>
            ) : (
              <div className="space-y-2">
                {cuenta.porMetodo.map((m) => (
                  <div key={m.metodo} className="py-2 border-b border-neutral-100 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-900">
                        {ICONO_METODO[m.metodo] ?? '·'} {m.metodo}
                        <span className="font-normal text-neutral-600 ml-1.5">
                          ({m.cobros} cobro{m.cobros === 1 ? '' : 's'})
                        </span>
                      </span>
                      <span className="font-bold text-neutral-900 tabular-nums">
                        {money(m.cobrado)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-0.5">
                      <span className={m.comision > 0 ? 'text-red-700' : 'text-green-700'}>
                        {m.comision > 0
                          ? `comisión −${money(m.comision)}`
                          : 'llega completo, sin comisión'}
                      </span>
                      <span className="font-semibold text-green-700 tabular-nums">
                        te quedan {money(m.disponible)}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
                  <span className="font-bold text-neutral-900">Disponible de ventas</span>
                  <span className="font-bold text-green-700 tabular-nums text-lg">
                    {money(cuenta.disponibleTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900 mb-3">Cómo se movió la cuenta</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-700">Ventas ya sin comisión</dt>
                <dd className="font-semibold text-neutral-900 tabular-nums">
                  {money(cuenta.disponibleTotal)}
                </dd>
              </div>
              {cuenta.rendimiento > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">+ Rendimiento de la inversión</dt>
                  <dd className="font-semibold text-green-700 tabular-nums">
                    {money(cuenta.rendimiento)}
                  </dd>
                </div>
              )}
              {cuenta.otrasEntradas > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">+ Otras entradas</dt>
                  <dd className="font-semibold text-green-700 tabular-nums">
                    {money(cuenta.otrasEntradas)}
                  </dd>
                </div>
              )}
              {cuenta.salidas > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">− Dinero que sacaste</dt>
                  <dd className="font-semibold text-red-700 tabular-nums">
                    −{money(cuenta.salidas)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-100 pt-2">
                <dt className="font-bold text-neutral-900">Se movió en total</dt>
                <dd className="font-bold text-neutral-900 tabular-nums">
                  {money(cuenta.movimientoNeto)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-600 mt-2">
              Es lo que creció (o bajó) la cuenta en estos {cuenta.dias} días, sin contar lo que ya
              tenías antes.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900">📈 Lo que rinde tu dinero</h2>
            <p className="text-xs text-neutral-700 mt-0.5 mb-3">
              El banco te paga por dejar el dinero ahí. Anótalo abajo como
              &ldquo;Rendimiento&rdquo; y aquí te digo a cuánto sale al año.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                  Ganado en {cuenta.dias} días
                </p>
                <p className="text-2xl font-bold text-green-700 tabular-nums">
                  {money(cuenta.rendimiento)}
                </p>
              </div>
              <div className="flex-1 min-w-[170px]">
                <label className="block text-[11px] text-neutral-600 uppercase tracking-wide mb-1">
                  ¿Cuánto tienes en la cuenta?
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={saldo}
                    onChange={(e) => {
                      setSaldo(e.target.value);
                      setSaldoTocado(true);
                    }}
                    placeholder="lo que dice Mercado Pago"
                    className={`${inputCls} flex-1 min-w-0`}
                  />
                  <button
                    onClick={async () => {
                      const ok = await accion('/api/admin/cuenta', {
                        accion: 'saldo',
                        monto: saldo,
                        fechaISO: diaISO(0),
                      });
                      if (ok) setSaldoTocado(false);
                    }}
                    disabled={ocupado || !saldo.trim() || !saldoTocado}
                    className="bg-marron text-white font-semibold px-3 py-2 rounded-xl text-sm active:scale-95 disabled:opacity-40"
                  >
                    {saldoTocado ? 'Guardar' : 'Guardado'}
                  </button>
                </div>
              </div>
            </div>
            {tasa !== null ? (
              <p className="text-sm text-neutral-800 mt-3 bg-green-50 border border-green-200 rounded-xl p-3">
                A ese paso, tu dinero rinde <b>{tasa.toFixed(2)}% al año</b>.
                {cuenta.saldoFecha && !saldoTocado && (
                  <span className="block text-xs text-neutral-700 mt-1">
                    Saldo anotado el {cuenta.saldoFecha}. Actualízalo cuando quieras.
                  </span>
                )}
                {saldoTocado && (
                  <span className="block text-xs text-amber-800 mt-1">
                    Dale a Guardar para que quede anotado.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-neutral-600 mt-3">
                Escribe cuánto tienes en la cuenta y te calculo el porcentaje: $6 de rendimiento no
                es lo mismo sobre $600 que sobre $6,000.
              </p>
            )}
          </div>
        </>
      )}

      {/* ─────────── ANOTAR UN MOVIMIENTO — uno solo para las dos ───────────
          Antes estaba duplicado en las dos pantallas, así que había que
          decidir en cuál entrar antes de saber a cuál pertenecía el
          movimiento. Aquí se elige la bolsa y ya. */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
        <div>
          <h2 className="font-bold text-neutral-900">Anotar entrada o salida de dinero</h2>
          <p className="text-xs text-neutral-700 mt-0.5">
            Lo que sacas para pagar insumos o proveedores, lo que metes sin ser venta, y el
            rendimiento que te paga el banco. Salga del cajón o de la cuenta, se anota aquí.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-neutral-800 mb-1">¿De dónde salió?</p>
          <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl w-fit max-w-full">
            {(
              [
                ['Efectivo', '💵 Del cajón'],
                ['Digital', '🏦 De la cuenta'],
              ] as const
            ).map(([v, etiqueta]) => (
              <button
                key={v}
                onClick={() => {
                  setBolsa(v);
                  // El cajón no genera intereses; si estaba en Rendimiento,
                  // se cae a Salida para no guardar algo que no existe.
                  if (v === 'Efectivo' && tipoMov === 'Rendimiento') setTipoMov('Salida');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  bolsa === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl w-fit max-w-full">
          {(
            [
              ['Salida', '↑ Saqué dinero'],
              ['Rendimiento', '📈 Rendimiento'],
              ['Entrada', '↓ Metí dinero'],
            ] as const
          )
            .filter(([v]) => v !== 'Rendimiento' || bolsa === 'Digital')
            .map(([v, etiqueta]) => (
              <button
                key={v}
                onClick={() => setTipoMov(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  tipoMov === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                }`}
              >
                {etiqueta}
              </button>
            ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={fechaMov}
            max={diaISO(0)}
            onChange={(e) => setFechaMov(e.target.value)}
            className={inputCls}
          />
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
              className={`${inputCls} w-24`}
            />
          </div>
          <input
            value={motivoMov}
            onChange={(e) => setMotivoMov(e.target.value)}
            placeholder={
              tipoMov === 'Salida'
                ? bolsa === 'Efectivo'
                  ? 'Ej. compré limones en la esquina'
                  : 'Ej. pagué el pollo de COSTCO'
                : tipoMov === 'Rendimiento'
                  ? 'opcional'
                  : 'Ej. deposité de mi bolsa'
            }
            className={`${inputCls} flex-1 min-w-[150px]`}
          />
          <button
            onClick={async () => {
              const ok = await accion('/api/admin/cuenta', {
                accion: 'movimiento',
                tipo: tipoMov,
                monto: montoMov,
                motivo: motivoMov,
                fechaISO: fechaMov,
                cuenta: bolsa,
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

        {/* ¿En qué se fue? Si fue un insumo, el movimiento queda ligado a él.
            La compra NO se registra aquí: eso necesita cuántos kilos
            llegaron, que esta pantalla no pregunta. */}
        {tipoMov === 'Salida' && (caja?.insumos?.length ?? 0) > 0 && (
          <div>
            <label className="block text-sm font-semibold text-neutral-800 mb-1">
              ¿Fue para un insumo?
            </label>
            <select
              value={insumoMov}
              onChange={(e) => {
                setInsumoMov(e.target.value);
                const n = caja?.insumos?.find((i) => i.id === e.target.value)?.nombre;
                if (n && !motivoMov.trim()) setMotivoMov(`Compré ${n}`);
              }}
              className={`${inputCls} w-full`}
            >
              <option value="">No, fue otra cosa</option>
              {caja?.insumos?.map((i) => (
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        {cuenta && cuenta.movimientos.length > 0 && (
          <>
            <ul className="space-y-1.5">
              {cuenta.movimientos.map((m) => (
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
                  <span className="flex-1 min-w-0 text-neutral-800 truncate">
                    <span title={m.cuenta === 'Efectivo' ? 'Del cajón' : 'De la cuenta'}>
                      {m.cuenta === 'Efectivo' ? '💵 ' : '🏦 '}
                    </span>
                    {m.tipo === 'Rendimiento' && '📈 '}
                    {m.motivo}
                  </span>
                  <span className="text-[11px] text-neutral-600 shrink-0">{m.fecha.slice(5)}</span>
                  <button
                    onClick={() => accion('/api/admin/cuenta', { accion: 'borrar', fila: m.fila })}
                    disabled={ocupado}
                    title="Borrar este movimiento"
                    className="shrink-0 w-7 h-7 rounded-lg bg-white text-neutral-600 font-bold active:scale-90 disabled:opacity-50"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-600">
              Se muestran los del periodo elegido en la pestaña de la cuenta. Los 💵 cuentan en el
              corte del cajón; los 🏦, en el saldo de la cuenta.
            </p>
          </>
        )}
      </div>
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
  const bg = cuadra
    ? 'bg-green-50 border-green-200'
    : falta
      ? 'bg-red-50 border-red-200'
      : 'bg-amber-50 border-amber-200';
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
