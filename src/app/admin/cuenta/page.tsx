'use client';

/**
 * Cuenta: el dinero que no está en el cajón.
 *
 * Lo que entra por terminal, pago en línea y transferencia cae aquí, no en
 * la caja. Va aparte del corte porque se comporta distinto: el cajón se
 * cuenta a mano cada noche y se cierra, y esto es un saldo que corre y se
 * compara contra lo que dice la app del banco.
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
  /** 'Efectivo' (el cajón) o 'Digital' (la cuenta) */
  cuenta: string;
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
  cobradoTotal: number;
  comisionTotal: number;
  disponibleTotal: number;
  rendimiento: number;
  otrasEntradas: number;
  salidas: number;
  movimientoNeto: number;
  movimientos: Movimiento[];
  /** Último saldo capturado y de cuándo es */
  saldo: number | null;
  saldoFecha: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const ICONO: Record<string, string> = {
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

export default function CuentaPage() {
  const [desde, setDesde] = useState(diaISO(0).slice(0, 8) + '01');
  const [hasta, setHasta] = useState(diaISO(0));
  /** Lo que dice la app del banco. Se guarda; no es solo de pantalla. */
  const [saldo, setSaldo] = useState('');
  const [saldoTocado, setSaldoTocado] = useState(false);
  /** De qué bolsa salió el dinero del movimiento que se está anotando */
  const [bolsa, setBolsa] = useState<'Digital' | 'Efectivo'>('Digital');
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const [tipo, setTipo] = useState<'Salida' | 'Rendimiento' | 'Entrada'>('Salida');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(diaISO(0));

  const cargar = useCallback(async () => {
    setCargando(true);
    const q = new URLSearchParams({ desde, hasta });
    const res = await fetch(`/api/admin/cuenta?${q}`);
    const data = await res.json();
    setEstado(res.ok ? data : null);
    if (!res.ok) setError(data.error || 'No se pudo cargar');
    // Solo se rellena si ella no lo está editando, para no borrarle lo escrito
    if (res.ok && !saldoTocado && data.saldo !== null && data.saldo !== undefined) {
      setSaldo(String(data.saldo));
    }
    setCargando(false);
    // saldoTocado a propósito fuera de las dependencias: incluirlo
    // recargaría la pantalla en cuanto se toca el campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(cuerpo: Record<string, unknown>) {
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/cuenta', {
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

  return (
    <div className="space-y-5 max-w-xl">
      <p className="text-sm text-neutral-700">
        El dinero que <b>no</b> está en el cajón: lo que te pagan con terminal, en línea o por
        transferencia. Aquí anotas también lo que sacas de la cuenta para pagar insumos.
      </p>

      {/* Periodo */}
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

      {cargando && <p className="text-neutral-700 animate-pulse">Cargando…</p>}

      {estado && (
        <>
          {/* Lo que entró por ventas: cobrado contra lo que de verdad quedó */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900">Lo que entró por ventas</h2>
            <p className="text-xs text-neutral-700 mt-0.5 mb-3">
              <b>Cobrado</b> es lo que pagó el cliente. <b>Disponible</b> es lo que quedó en la
              cuenta, ya sin comisión. Hoy el dinero se libera al momento, así que la única
              diferencia es lo que se lleva Mercado Pago.
            </p>

            {estado.porMetodo.length === 0 ? (
              <p className="text-sm text-neutral-700">No hubo cobros a la cuenta en este periodo.</p>
            ) : (
              <div className="space-y-2">
                {estado.porMetodo.map((m) => (
                  <div key={m.metodo} className="py-2 border-b border-neutral-100 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-neutral-900">
                        {ICONO[m.metodo] ?? '·'} {m.metodo}
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
                    {money(estado.disponibleTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Cómo se movió en el periodo */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900 mb-3">Cómo se movió la cuenta</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-700">Ventas ya sin comisión</dt>
                <dd className="font-semibold text-neutral-900 tabular-nums">
                  {money(estado.disponibleTotal)}
                </dd>
              </div>
              {estado.rendimiento > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">+ Rendimiento de la inversión</dt>
                  <dd className="font-semibold text-green-700 tabular-nums">
                    {money(estado.rendimiento)}
                  </dd>
                </div>
              )}
              {estado.otrasEntradas > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">+ Otras entradas</dt>
                  <dd className="font-semibold text-green-700 tabular-nums">
                    {money(estado.otrasEntradas)}
                  </dd>
                </div>
              )}
              {estado.salidas > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-700">− Dinero que sacaste</dt>
                  <dd className="font-semibold text-red-700 tabular-nums">
                    −{money(estado.salidas)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-100 pt-2">
                <dt className="font-bold text-neutral-900">Se movió en total</dt>
                <dd className="font-bold text-neutral-900 tabular-nums">
                  {money(estado.movimientoNeto)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-600 mt-2">
              Es lo que creció (o bajó) la cuenta en estos {estado.dias} días, sin contar lo que ya
              tenías antes.
            </p>
          </div>

          {/* Rendimiento: cuánto rinde de verdad */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900">📈 Lo que rinde tu dinero</h2>
            <p className="text-xs text-neutral-700 mt-0.5 mb-3">
              El banco te paga por dejar el dinero ahí. Anótalo abajo con el botón
              &ldquo;Rendimiento&rdquo; y aquí te digo a cuánto sale al año.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                  Ganado en {estado.dias} días
                </p>
                <p className="text-2xl font-bold text-green-700 tabular-nums">
                  {money(estado.rendimiento)}
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
                      const ok = await guardar({
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

            {/* La tasa se recalcula mientras escribe: la cuenta es pura y
                vive en el navegador, no hace falta ir al servidor. */}
            {(() => {
              const n = parseFloat(saldo.replace(',', '.'));
              const tasa = rendimientoAnual(estado.rendimiento, n, estado.dias);
              if (tasa === null) {
                return (
                  <p className="text-xs text-neutral-600 mt-3">
                    Escribe cuánto tienes en la cuenta y te calculo el porcentaje: $6 de rendimiento
                    no es lo mismo sobre $600 que sobre $6,000.
                  </p>
                );
              }
              return (
                <p className="text-sm text-neutral-800 mt-3 bg-green-50 border border-green-200 rounded-xl p-3">
                  A ese paso, tu dinero rinde <b>{tasa.toFixed(2)}% al año</b>.
                  {estado.saldoFecha && !saldoTocado && (
                    <span className="block text-xs text-neutral-700 mt-1">
                      Saldo anotado el {estado.saldoFecha}. Actualízalo cuando quieras.
                    </span>
                  )}
                  {saldoTocado && (
                    <span className="block text-xs text-amber-800 mt-1">
                      Dale a Guardar para que quede anotado.
                    </span>
                  )}
                </p>
              );
            })()}
          </div>

          {/* Anotar movimientos */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
            <div>
              <h2 className="font-bold text-neutral-900">Anotar un movimiento</h2>
              <p className="text-xs text-neutral-700 mt-0.5">
                Lo que sacas para pagar insumos o proveedores, lo que metes sin ser venta, y el
                rendimiento que te paga el banco. Dinero del cajón o de la cuenta: tú eliges.
              </p>
            </div>

            {/* De qué bolsa salió. Lo mismo se paga con lo del cajón que
                con lo de la cuenta, y si no se distingue, ninguno de los
                dos cuadra al final del día. */}
            <div>
              <p className="text-xs font-semibold text-neutral-800 mb-1">¿De dónde salió?</p>
              <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl w-fit max-w-full">
                {(
                  [
                    ['Digital', '🏦 De la cuenta'],
                    ['Efectivo', '💵 Del cajón'],
                  ] as const
                ).map(([v, etiqueta]) => (
                  <button
                    key={v}
                    onClick={() => {
                      setBolsa(v);
                      // El cajón no genera intereses; si estaba en
                      // Rendimiento, se cae a Salida para no guardar algo
                      // que no existe.
                      if (v === 'Efectivo' && tipo === 'Rendimiento') setTipo('Salida');
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
                  onClick={() => setTipo(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    tipo === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={fecha}
                max={diaISO(0)}
                onChange={(e) => setFecha(e.target.value)}
                className={inputCls}
              />
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-neutral-700">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} w-24`}
                />
              </div>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  tipo === 'Salida'
                    ? bolsa === 'Efectivo'
                      ? 'Ej. compré limones en la esquina'
                      : 'Ej. pagué el pollo de COSTCO'
                    : tipo === 'Rendimiento'
                      ? 'opcional'
                      : 'Ej. deposité de mi bolsa'
                }
                className={`${inputCls} flex-1 min-w-[150px]`}
              />
              <button
                onClick={async () => {
                  const ok = await guardar({
                    accion: 'movimiento',
                    tipo,
                    monto,
                    motivo,
                    fechaISO: fecha,
                    cuenta: bolsa === 'Efectivo' ? 'Efectivo' : 'Digital',
                  });
                  if (ok) {
                    setMonto('');
                    setMotivo('');
                  }
                }}
                disabled={ocupado}
                className="bg-marron text-white font-semibold px-4 py-2 rounded-xl active:scale-95 disabled:opacity-50"
              >
                Anotar
              </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {estado.movimientos.length > 0 && (
              <ul className="space-y-1.5">
                {estado.movimientos.map((m) => (
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
                      onClick={() => guardar({ accion: 'borrar', fila: m.fila })}
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

            {/* Los del cajón se ven aquí porque se anotan aquí, pero suman
                en el corte de caja: mezclarlos descuadraría las dos cosas. */}
            {estado.movimientos.some((m) => m.cuenta === 'Efectivo') && (
              <p className="text-xs text-neutral-600">
                Los que dicen 💵 son del cajón: se anotan aquí pero cuentan en el corte de Caja, no
                en el saldo de la cuenta.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
