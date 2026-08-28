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
  abrioSola: boolean;
  cerroSola: boolean;
  sinEntregar: { id: string; cliente: string; total: number; estado: string; metodo: string }[];
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
  /** Todo lo que ha entrado a la cuenta desde la primera venta */
  totalHistorico: number;
  /** Cada vez que se anotó cuánto había, de lo más nuevo hacia atrás */
  historialSaldos: { fecha: string; saldo: number; quien: string; cambio: number | null }[];
  desdeSiempre: {
    desde: string;
    ventas: number;
    rendimiento: number;
    entradas: number;
    salidas: number;
    cuantasSalidas: number;
  };
  movimientosCuenta: Movimiento[];
  otrasEntradas: number;
  salidas: number;
  movimientoNeto: number;
  movimientos: Movimiento[];
  saldo: number | null;
  saldoFecha: string;
}

/*
  Con separador de miles: "$18300.00" hay que contarlo con el dedo para
  saber si son dieciocho mil o ciento ochenta mil, y esta pantalla es
  justo donde eso importa.
*/
const money = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * "2026-09-05" → "5 de septiembre".
 *
 * Se arma a mano y no con Date(): "2026-09-05" se lee como UTC y en
 * Monterrey eso es el 4 por la tarde, así que la fecha se recorrería un
 * día — y aquí un día es la diferencia entre pagar a tiempo y no.
 */
const fechaBonita = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const mes = MESES[+iso.slice(5, 7) - 1] ?? '';
  return `${+iso.slice(8, 10)} de ${mes}`;
};

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

/** Cómo va la tarjeta del local. Lo calcula el servidor en credito.ts. */
interface EstadoCredito {
  limite: number;
  usado: number;
  disponible: number;
  porcentajeUsado: number;
  diaCorte: number;
  diaPago: number;
  ultimoCorte: string;
  fechaLimite: string;
  porPagar: number;
  diasParaPagar: number | null;
  delSiguientePeriodo: number;
  gastadoPorCategoria: { categoria: string; monto: number }[];
  movimientos: {
    id: string;
    fecha: string;
    tipo: 'Cargo' | 'Pago';
    concepto: string;
    monto: number;
    categoria: string;
    quien: string;
    notas: string;
  }[];
  categorias: string[];
}

const inputCls =
  'bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron';

export default function DineroPage() {
  const [pestana, setPestana] = useState<'efectivo' | 'cuenta' | 'tarjeta'>('efectivo');
  const [caja, setCaja] = useState<EstadoCaja | null>(null);
  const [cuenta, setCuenta] = useState<EstadoCuenta | null>(null);
  const [credito, setCredito] = useState<EstadoCredito | null>(null);
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
  /** Cuántas capturas de saldo se muestran */
  const [verSaldos, setVerSaldos] = useState<'pocos' | 'todos'>('pocos');
  /** Ver una por una las ventas que faltan por entregar */
  const [revisandoEntregas, setRevisandoEntregas] = useState(false);
  /** A qué venta se le está preguntando cómo pagaron */
  const [preguntandoMetodo, setPreguntandoMetodo] = useState<string | null>(null);

  /**
   * Marca una venta como entregada.
   *
   * Si no se sabe cómo pagaron, el servidor no la deja pasar —el corte no
   * cuadraría— así que se pregunta y se reintenta con la respuesta.
   */
  const entregar = async (id: string, metodoPago?: string) => {
    setOcupado(true);
    try {
      const res = await fetch('/api/admin/pedidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPedido: id,
          nuevoEstado: 'Entregado',
          ...(metodoPago ? { metodoPago } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}) as { codigo?: string });
      if (!res.ok && d.codigo === 'FALTA_METODO_PAGO') {
        setPreguntandoMetodo(id);
        return false;
      }
      setPreguntandoMetodo(null);
      await cargar();
      return res.ok;
    } catch {
      return false;
    } finally {
      setOcupado(false);
    }
  };

  /**
   * «Sí, ya se entregaron todas».
   *
   * Va una por una y no todas de golpe: las que no dicen cómo pagaron se
   * quedan, y hay que preguntarlas. Cerrarlas a ciegas metería cobros de
   * terminal en el cajón y descuadraría el corte, que es justo lo que
   * este aviso viene a evitar.
   */
  const entregarTodas = async () => {
    if (!caja) return;
    const conMetodo = caja.sinEntregar.filter((v) => v.metodo);
    for (const v of conMetodo) await entregar(v.id);
    const faltan = caja.sinEntregar.filter((v) => !v.metodo);
    if (faltan.length > 0) setRevisandoEntregas(true);
  };

  /** Cuántos movimientos de la cuenta se muestran */
  const [verMovsCuenta, setVerMovsCuenta] = useState<'pocos' | 'todos'>('pocos');

  // Movimiento (compartido)
  const [bolsa, setBolsa] = useState<'Efectivo' | 'Digital'>('Efectivo');
  const [tipoMov, setTipoMov] = useState<'Salida' | 'Entrada' | 'Rendimiento'>('Salida');
  const [montoMov, setMontoMov] = useState('');
  const [motivoMov, setMotivoMov] = useState('');
  const [fechaMov, setFechaMov] = useState(diaISO(0));
  const [insumoMov, setInsumoMov] = useState('');
  /**
   * Qué movimientos se ven. Por omisión los del periodo en el que estás
   * parada: ver todo lo que ha salido desde siempre no dice nada y tapa
   * lo del día, que es lo que se está revisando.
   */
  const [verMovs, setVerMovs] = useState<'periodo' | 'todos'>('periodo');

  // Tarjeta del local
  const [tipoCred, setTipoCred] = useState<'Cargo' | 'Pago'>('Cargo');
  const [montoCred, setMontoCred] = useState('');
  const [conceptoCred, setConceptoCred] = useState('');
  const [categoriaCred, setCategoriaCred] = useState('Insumos');
  const [fechaCred, setFechaCred] = useState(diaISO(0));
  const [verMovsCred, setVerMovsCred] = useState<'pocos' | 'todos'>('pocos');
  /** Los datos de la tarjeta se editan poco: el formulario va escondido */
  const [editandoTarjeta, setEditandoTarjeta] = useState(false);
  const [limiteCred, setLimiteCred] = useState('');
  const [corteCred, setCorteCred] = useState('');
  const [pagoCred, setPagoCred] = useState('');

  /** Anota un cargo o un pago de la tarjeta. */
  const guardarCredito = async () => {
    const monto = parseFloat(montoCred.replace(',', '.'));
    if (!(monto > 0)) return setError('Escribe cuánto fue.');
    if (!conceptoCred.trim()) return setError('Escribe en qué se usó.');
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/credito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha: fechaCred,
        tipo: tipoCred,
        concepto: conceptoCred.trim(),
        monto,
        categoria: tipoCred === 'Cargo' ? categoriaCred : '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return setError(data.error || 'No se pudo guardar');
    setMontoCred('');
    setConceptoCred('');
    await cargar();
  };

  const borrarCredito = async (id: string, concepto: string) => {
    if (!confirm(`¿Borrar "${concepto}" de la tarjeta?`)) return;
    setOcupado(true);
    setError('');
    const res = await fetch(`/api/admin/credito?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return setError(data.error || 'No se pudo borrar');
    await cargar();
  };

  const guardarTarjeta = async () => {
    setOcupado(true);
    setError('');
    const res = await fetch('/api/admin/credito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'config',
        datos: { limite: limiteCred, diaCorte: corteCred, diaPago: pagoCred },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return setError(data.error || 'No se pudo guardar');
    setEditandoTarjeta(false);
    await cargar();
  };

  /**
   * Abre el formulario con lo que hay guardado.
   *
   * Los días en 0 se enseñan vacíos y no como "0": cero no es un día del
   * mes, es "todavía no me lo has dicho".
   */
  const abrirEditarTarjeta = () => {
    if (!credito) return;
    setLimiteCred(String(credito.limite));
    setCorteCred(credito.diaCorte ? String(credito.diaCorte) : '');
    setPagoCred(credito.diaPago ? String(credito.diaPago) : '');
    setEditandoTarjeta(true);
    setError('');
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    const [rc, rq, rt] = await Promise.all([
      fetch('/api/admin/caja'),
      fetch(`/api/admin/cuenta?${new URLSearchParams({ desde, hasta })}`),
      fetch('/api/admin/credito'),
    ]);
    const [dc, dq, dt] = await Promise.all([rc.json(), rq.json(), rt.json()]);
    if (rt.ok) setCredito(dt);
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
            ['tarjeta', '💳 La tarjeta'],
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

              {/*
                Se abrió sola con la primera venta. Hay que decirlo: el fondo
                es el de la última vez, no uno que alguien haya contado, y si
                ese día se dejó otra cantidad el corte marcaría un faltante
                que no existe.
              */}
              {caja.abrioSola && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-900">
                    ⏰ La caja se abrió sola con la primera venta
                  </p>
                  <p className="text-xs text-amber-800">
                    Le puso {money(caja.fondoApertura ?? 0)} de fondo porque es lo que dejaste la
                    última vez. Si hoy dejaste otra cantidad, corrígela aquí — si no, el corte va a
                    marcar un faltante que no existe.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={fondo}
                      onChange={(e) => setFondo(e.target.value)}
                      placeholder={`Ej. ${caja.fondoApertura ?? 500}`}
                      className={`${inputCls} flex-1 min-w-0`}
                    />
                    <button
                      onClick={() => accion('/api/admin/caja', { accion: 'abrir', fondo })}
                      disabled={ocupado || !fondo}
                      className="bg-amber-700 text-white text-sm font-semibold px-4 rounded-xl active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      Corregir
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      accion('/api/admin/caja', {
                        accion: 'abrir',
                        fondo: String(caja.fondoApertura ?? 0),
                      })
                    }
                    disabled={ocupado}
                    className="text-xs font-semibold text-amber-900 underline active:scale-95 disabled:opacity-50"
                  >
                    Está bien así, déjalo en {money(caja.fondoApertura ?? 0)}
                  </button>
                </div>
              )}
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
                  {/*
                    Antes de cerrar, las ventas que quedaron colgando.

                    Aquí y no en Pedidos porque este es el momento en que se
                    revisa el día: una venta sin marcar entregada se arrastra
                    al reporte de mañana y ya nadie se acuerda de qué pasó.
                  */}
                  {caja.sinEntregar.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-bold text-amber-900">
                        {caja.sinEntregar.length === 1
                          ? 'Queda 1 venta sin marcar como entregada'
                          : `Quedan ${caja.sinEntregar.length} ventas sin marcar como entregadas`}
                      </p>
                      <p className="text-xs text-amber-800">
                        ¿Ya se entregaron todas? Si las dejas así, mañana siguen apareciendo
                        como pendientes.
                      </p>

                      {!revisandoEntregas ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={entregarTodas}
                            disabled={ocupado}
                            className="bg-amber-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
                          >
                            Sí, ya se entregaron todas
                          </button>
                          <button
                            onClick={() => setRevisandoEntregas(true)}
                            disabled={ocupado}
                            className="bg-white border border-amber-300 text-amber-900 text-sm font-semibold px-4 py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
                          >
                            No, déjame ver cuáles
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {caja.sinEntregar.map((v) => (
                            <li
                              key={v.id}
                              className="bg-white border border-amber-200 rounded-lg p-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0">
                                  <span className="block text-sm font-semibold text-neutral-900 truncate">
                                    {v.cliente || v.id}
                                  </span>
                                  <span className="block text-[11px] text-neutral-600">
                                    {v.estado} · {money(v.total)}
                                    {v.metodo ? ` · ${v.metodo}` : ''}
                                  </span>
                                </span>
                                <button
                                  onClick={() => entregar(v.id)}
                                  disabled={ocupado}
                                  className="shrink-0 bg-marron text-white text-xs font-bold px-3 py-2 rounded-lg active:scale-95 disabled:opacity-50"
                                >
                                  Entregada
                                </button>
                              </div>

                              {preguntandoMetodo === v.id && (
                                <div className="mt-2 border-t border-neutral-100 pt-2">
                                  <p className="text-xs font-semibold text-neutral-800 mb-1.5">
                                    ¿Cómo te pagó?
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {['Efectivo', 'Terminal', 'Transferencia', 'Pago en línea'].map(
                                      (m) => (
                                        <button
                                          key={m}
                                          onClick={() => entregar(v.id, m)}
                                          disabled={ocupado}
                                          className="bg-marron text-white text-xs font-semibold px-3 py-2 rounded-lg active:scale-95 disabled:opacity-50"
                                        >
                                          {m}
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <h3 className="font-bold text-neutral-900">2. Hacer el corte</h3>
                  {/*
                    Cerró sola a la hora de cierre, pero el corte sigue
                    disponible: la hora automática termina el día, no cuenta
                    el dinero. Poner ahí lo esperado haría que todos los días
                    cuadraran perfecto y el corte dejaría de servir.
                  */}
                  {caja.cerroSola && (
                    <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      🔒 La caja se cerró sola a las {caja.horaCorte} y se mandó el corte del día,
                      pero nadie contó el efectivo. Si todavía puedes contarlo, anótalo aquí.
                    </p>
                  )}
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

            {/*
              El estado de cuenta completo, desde la primera venta.

              Va contra el ACUMULADO de siempre y no contra el periodo
              elegido arriba: el saldo del banco viene desde el día uno,
              así que enfrentarlo contra un mes daría una diferencia falsa
              cada vez. Y se desglosa en vez de mostrar solo el total,
              porque cuando no cuadra lo que se necesita saber es en qué
              renglón está la diferencia.
            */}
            <div className="mt-3 border-t border-neutral-100 pt-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                  Movimientos en Mercado Pago
                </p>
                {cuenta.desdeSiempre.desde && (
                  <p className="text-[11px] text-neutral-600">
                    desde tu primera venta, el {cuenta.desdeSiempre.desde}
                  </p>
                )}
              </div>

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-neutral-700">Ventas ya sin comisión</dt>
                  <dd className="font-semibold text-neutral-900 tabular-nums">
                    {money(cuenta.desdeSiempre.ventas)}
                  </dd>
                </div>
                {cuenta.desdeSiempre.rendimiento > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-700">+ Rendimiento</dt>
                    <dd className="font-semibold text-green-700 tabular-nums">
                      {money(cuenta.desdeSiempre.rendimiento)}
                    </dd>
                  </div>
                )}
                {cuenta.desdeSiempre.entradas > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-700">+ Otras entradas</dt>
                    <dd className="font-semibold text-green-700 tabular-nums">
                      {money(cuenta.desdeSiempre.entradas)}
                    </dd>
                  </div>
                )}
                {cuenta.desdeSiempre.salidas > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-700">
                      − Dinero que sacaste
                      <span className="text-neutral-600">
                        {' '}
                        ({cuenta.desdeSiempre.cuantasSalidas}{' '}
                        {cuenta.desdeSiempre.cuantasSalidas === 1 ? 'gasto' : 'gastos'})
                      </span>
                    </dt>
                    <dd className="font-semibold text-red-700 tabular-nums">
                      −{money(cuenta.desdeSiempre.salidas)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2 border-t border-neutral-200 pt-1.5">
                  <dt className="font-bold text-neutral-900">Debe haber hoy</dt>
                  <dd className="font-bold text-neutral-900 tabular-nums">
                    {money(cuenta.totalHistorico)}
                  </dd>
                </div>
                {cuenta.saldo !== null && !saldoTocado && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-neutral-700">Mercado Pago dice</dt>
                    <dd className="font-semibold text-neutral-900 tabular-nums">
                      {money(cuenta.saldo)}
                    </dd>
                  </div>
                )}
              </dl>

              {cuenta.saldo !== null && !saldoTocado && (() => {
                const diferencia = Math.round((cuenta.saldo - cuenta.totalHistorico) * 100) / 100;
                if (Math.abs(diferencia) < 0.05) {
                  return (
                    <p className="mt-2 text-sm font-semibold text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">
                      ✅ Cuadra. Las dos cuentas dicen lo mismo.
                    </p>
                  );
                }
                return (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      {diferencia > 0 ? 'Sobran' : 'Faltan'} {money(Math.abs(diferencia))} en
                      Mercado Pago
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      {diferencia > 0
                        ? 'Casi siempre es el rendimiento que el banco te pagó y todavía no está anotado.'
                        : 'Puede ser un gasto que saliste de la cuenta y no has anotado, o una transferencia que registraste y nunca llegó.'}
                    </p>
                    {diferencia > 0 && (
                      <button
                        onClick={() =>
                          accion('/api/admin/cuenta', {
                            accion: 'movimiento',
                            tipo: 'Rendimiento',
                            monto: String(diferencia),
                            motivo: 'Rendimiento de Mercado Pago',
                            cuenta: 'Digital',
                            fechaISO: diaISO(0),
                          })
                        }
                        disabled={ocupado}
                        className="mt-2 w-full bg-amber-700 text-white text-sm font-semibold py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
                      >
                        Anotar {money(diferencia)} como rendimiento
                      </button>
                    )}
                  </div>
                );
              })()}

              {/*
                Uno por uno. El resumen de arriba dice cuánto salió; esto
                dice en qué, que es lo que se busca cuando el total no
                cuadra con lo que uno recuerda haber gastado.
              */}
              {cuenta.movimientosCuenta.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <p className="text-[11px] text-neutral-600 uppercase tracking-wide">
                      Uno por uno
                    </p>
                    {cuenta.movimientosCuenta.length > 6 && (
                      <button
                        onClick={() => setVerMovsCuenta(verMovsCuenta === 'todos' ? 'pocos' : 'todos')}
                        className="text-[11px] font-semibold text-marron underline"
                      >
                        {verMovsCuenta === 'todos'
                          ? 'Ver solo los últimos'
                          : `Ver los ${cuenta.movimientosCuenta.length}`}
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                    {(verMovsCuenta === 'todos'
                      ? cuenta.movimientosCuenta
                      : cuenta.movimientosCuenta.slice(0, 6)
                    ).map((m) => (
                      <li key={m.fila} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block text-sm text-neutral-900 truncate">
                            {m.motivo || (m.tipo === 'Rendimiento' ? 'Rendimiento' : 'Sin motivo')}
                          </span>
                          <span className="block text-[11px] text-neutral-600 tabular-nums">
                            {m.fecha}
                          </span>
                        </span>
                        <span
                          className={`font-semibold tabular-nums shrink-0 ${
                            m.tipo === 'Salida' ? 'text-red-700' : 'text-green-700'
                          }`}
                        >
                          {m.tipo === 'Salida' ? '−' : '+'}
                          {money(m.monto)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/*
                Los saldos que ella ha copiado del banco. Van al final y
                plegados: sirven para ver el ritmo, no para cuadrar.
              */}
              {cuenta.historialSaldos.length > 1 && (
                <div className="mt-3">
                  <button
                    onClick={() => setVerSaldos(verSaldos === 'todos' ? 'pocos' : 'todos')}
                    className="text-[11px] font-semibold text-marron underline"
                  >
                    {verSaldos === 'todos'
                      ? 'Ocultar los saldos que has anotado'
                      : `Ver los ${cuenta.historialSaldos.length} saldos que has anotado`}
                  </button>
                  {verSaldos === 'todos' && (
                    <>
                      <ul className="mt-1.5 divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
                        {cuenta.historialSaldos.map((h) => (
                          <li
                            key={h.fecha}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          >
                            <span className="text-neutral-700 tabular-nums shrink-0">{h.fecha}</span>
                            <span className="flex items-baseline gap-2 min-w-0">
                              {h.cambio !== null && h.cambio !== 0 && (
                                <span
                                  className={`text-xs font-semibold tabular-nums ${
                                    h.cambio > 0 ? 'text-green-700' : 'text-red-700'
                                  }`}
                                >
                                  {h.cambio > 0 ? '+' : '−'}
                                  {money(Math.abs(h.cambio))}
                                </span>
                              )}
                              <span className="font-semibold text-neutral-900 tabular-nums">
                                {money(h.saldo)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-neutral-700 mt-2">
                        Del {cuenta.historialSaldos[cuenta.historialSaldos.length - 1].fecha} al{' '}
                        {cuenta.historialSaldos[0].fecha}, el saldo pasó de{' '}
                        {money(cuenta.historialSaldos[cuenta.historialSaldos.length - 1].saldo)} a{' '}
                        {money(cuenta.historialSaldos[0].saldo)}.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ───────────────────────── LA TARJETA ─────────────────────────
          Línea de crédito de uso exclusivo del local. Vive aparte del
          cajón y de la cuenta porque un cargo NO saca dinero el día que
          se hace: el dinero sale cuando se paga la tarjeta, y ese pago sí
          se anota como salida de la cuenta. */}
      {pestana === 'tarjeta' && credito && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-bold text-neutral-900">Línea de crédito del local</h2>
                <p className="text-xs text-neutral-700 mt-0.5">
                  Solo para cosas de Moramango: insumos y servicios. Nada personal.
                </p>
              </div>
              <button
                onClick={abrirEditarTarjeta}
                className="text-xs font-semibold text-black bg-neutral-200 px-3 py-1.5 rounded-lg active:scale-95"
              >
                ✏️ Datos de la tarjeta
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">Te queda</p>
                <p className="text-xl font-bold text-neutral-900">{money(credito.disponible)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">Has usado</p>
                <p className="text-xl font-bold text-neutral-900">{money(credito.usado)}</p>
              </div>
              <div>
                <p className="text-[11px] text-neutral-600 uppercase tracking-wide">Tu línea</p>
                <p className="text-xl font-bold text-neutral-900">{money(credito.limite)}</p>
              </div>
            </div>

            {/* La barra dice de un vistazo lo que tres números tardan en
                decir. El color cambia al 75%: no es una alarma, es un
                aviso de que ya no queda mucho margen. */}
            <div>
              <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    credito.porcentajeUsado >= 90
                      ? 'bg-red-600'
                      : credito.porcentajeUsado >= 75
                        ? 'bg-amber-500'
                        : 'bg-green-600'
                  }`}
                  style={{ width: `${Math.min(100, credito.porcentajeUsado)}%` }}
                />
              </div>
              <p className="text-xs text-neutral-700 mt-1">
                Llevas usado el {credito.porcentajeUsado}% de la línea.
              </p>
            </div>
          </div>

          {/* Lo que hay que pagar y para cuándo */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-2">
            <h2 className="font-bold text-neutral-900">Lo que tienes que pagar</h2>
            {!credito.fechaLimite ? (
              /* Sin las fechas de la tarjeta no se puede calcular nada, y
                 enseñar el saldo total como "lo que debes pagar" sería
                 mentir: parte de eso se paga hasta el mes que sigue. */
              <p className="text-sm text-neutral-800">
                Todavía no sé cuándo corta ni cuándo se paga tu tarjeta. Ponlo en{' '}
                <button onClick={abrirEditarTarjeta} className="font-bold text-marron underline">
                  Datos de la tarjeta
                </button>{' '}
                y aquí te digo cuánto pagar y para cuándo.
              </p>
            ) : credito.porPagar <= 0 ? (
              <p className="text-sm font-semibold text-green-800">
                ✅ Nada pendiente. Lo del corte del {fechaBonita(credito.ultimoCorte)} ya está cubierto.
              </p>
            ) : (
              <>
                <p className="text-3xl font-bold text-neutral-900">{money(credito.porPagar)}</p>
                <p
                  className={`text-sm font-semibold ${
                    (credito.diasParaPagar ?? 0) < 0
                      ? 'text-red-700'
                      : (credito.diasParaPagar ?? 99) <= 5
                        ? 'text-amber-800'
                        : 'text-neutral-800'
                  }`}
                >
                  {(credito.diasParaPagar ?? 0) < 0
                    ? `⚠️ Se venció el ${fechaBonita(credito.fechaLimite)}, hace ${Math.abs(credito.diasParaPagar!)} días.`
                    : credito.diasParaPagar === 0
                      ? 'Hoy es el último día para pagarlo.'
                      : `Antes del ${fechaBonita(credito.fechaLimite)} — te quedan ${credito.diasParaPagar} días.`}
                </p>
                <p className="text-xs text-neutral-700">
                  Es lo que debías al corte del {fechaBonita(credito.ultimoCorte)}, menos lo que ya abonaste.
                </p>
              </>
            )}
            {credito.delSiguientePeriodo > 0 && (
              <p className="text-xs text-neutral-700 border-t border-neutral-100 pt-2">
                Aparte llevas <strong>{money(credito.delSiguientePeriodo)}</strong> gastados después
                del corte. Eso se paga hasta el periodo que sigue.
              </p>
            )}
          </div>

          {/* Anotar */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
            <h2 className="font-bold text-neutral-900">Anotar en la tarjeta</h2>

            <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-fit">
              {(
                [
                  ['Cargo', '🛒 Compré algo'],
                  ['Pago', '💸 Le aboné'],
                ] as const
              ).map(([v, etiqueta]) => (
                <button
                  key={v}
                  onClick={() => setTipoCred(v)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    tipoCred === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-700'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-neutral-700">
                ¿Cuánto?
                <input
                  type="number"
                  inputMode="decimal"
                  value={montoCred}
                  onChange={(e) => setMontoCred(e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} w-full mt-1`}
                />
              </label>
              <label className="text-xs font-semibold text-neutral-700">
                ¿Qué día?
                <input
                  type="date"
                  value={fechaCred}
                  onChange={(e) => setFechaCred(e.target.value)}
                  className={`${inputCls} w-full mt-1`}
                />
              </label>
            </div>

            <label className="block text-xs font-semibold text-neutral-700">
              {tipoCred === 'Cargo' ? '¿En qué se usó?' : '¿De dónde salió el abono?'}
              <input
                value={conceptoCred}
                onChange={(e) => setConceptoCred(e.target.value)}
                placeholder={
                  tipoCred === 'Cargo' ? 'Ej. Fruta de la semana' : 'Ej. Pago desde Mercado Pago'
                }
                className={`${inputCls} w-full mt-1`}
              />
            </label>

            {tipoCred === 'Cargo' && (
              <div>
                <p className="text-xs font-semibold text-neutral-700 mb-1">¿De qué tipo?</p>
                <div className="flex flex-wrap gap-1">
                  {credito.categorias.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategoriaCred(c)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                        categoriaCred === c
                          ? 'bg-marron text-white'
                          : 'bg-neutral-100 text-neutral-800'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={guardarCredito}
              disabled={ocupado}
              className="w-full bg-marron text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50"
            >
              Guardar
            </button>
            <p className="text-xs text-neutral-700">
              Un cargo no saca dinero del banco todavía. Cuando pagues la tarjeta, anota aquí el
              abono y además la salida en «La cuenta».
            </p>
          </div>

          {/* En qué se está yendo */}
          {credito.gastadoPorCategoria.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
              <h2 className="font-bold text-neutral-900 mb-2">En qué se ha ido</h2>
              <ul className="space-y-1">
                {credito.gastadoPorCategoria.map((g) => (
                  <li key={g.categoria} className="flex justify-between text-sm">
                    <span className="text-neutral-800">{g.categoria}</span>
                    <span className="font-semibold text-neutral-900">{money(g.monto)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Los movimientos */}
          <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5">
            <h2 className="font-bold text-neutral-900 mb-2">Todo lo de la tarjeta</h2>
            {credito.movimientos.length === 0 ? (
              <p className="text-sm text-neutral-700">
                Todavía nada. Lo que compres con la tarjeta se anota arriba.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-neutral-100">
                  {(verMovsCred === 'todos'
                    ? credito.movimientos
                    : credito.movimientos.slice(0, 8)
                  ).map((m) => (
                    <li key={m.id} className="py-2 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">
                          {m.tipo === 'Pago' ? '💸 ' : '🛒 '}
                          {m.concepto}
                        </p>
                        <p className="text-[11px] text-neutral-700">
                          {fechaBonita(m.fecha)}
                          {m.categoria && ` · ${m.categoria}`}
                          {m.quien && ` · ${m.quien}`}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold whitespace-nowrap ${
                          m.tipo === 'Pago' ? 'text-green-800' : 'text-neutral-900'
                        }`}
                      >
                        {m.tipo === 'Pago' ? '−' : '+'}
                        {money(m.monto)}
                      </span>
                      <button
                        onClick={() => borrarCredito(m.id, m.concepto)}
                        disabled={ocupado}
                        className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg active:scale-95 disabled:opacity-50"
                      >
                        🗑️
                      </button>
                    </li>
                  ))}
                </ul>
                {credito.movimientos.length > 8 && (
                  <button
                    onClick={() => setVerMovsCred(verMovsCred === 'todos' ? 'pocos' : 'todos')}
                    className="text-xs font-semibold text-marron mt-2"
                  >
                    {verMovsCred === 'todos' ? 'Ver menos' : `Ver los ${credito.movimientos.length}`}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Datos de la tarjeta */}
      {editandoTarjeta && credito && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditandoTarjeta(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl p-5 space-y-3 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-neutral-900 text-lg">Datos de la tarjeta</h2>

            <label className="block text-xs font-semibold text-neutral-700">
              ¿De cuánto es tu línea?
              <input
                type="number"
                inputMode="decimal"
                value={limiteCred}
                onChange={(e) => setLimiteCred(e.target.value)}
                className={`${inputCls} w-full mt-1`}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-neutral-700">
                Día que corta
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={corteCred}
                  onChange={(e) => setCorteCred(e.target.value)}
                  placeholder="Ej. 15"
                  className={`${inputCls} w-full mt-1`}
                />
              </label>
              <label className="text-xs font-semibold text-neutral-700">
                Día que se paga
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={pagoCred}
                  onChange={(e) => setPagoCred(e.target.value)}
                  placeholder="Ej. 5"
                  className={`${inputCls} w-full mt-1`}
                />
              </label>
            </div>
            <p className="text-xs text-neutral-700">
              Vienen en tu estado de cuenta. Si el día de pago es menor o igual al de corte, se
              entiende que cae en el mes siguiente — corta el 15, se paga el 5.
            </p>

            {error && (
              <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditandoTarjeta(false)}
                className="flex-1 bg-neutral-100 text-neutral-900 font-bold py-3 rounded-xl active:scale-95"
              >
                Cancelar
              </button>
              <button
                onClick={guardarTarjeta}
                disabled={ocupado}
                className="flex-1 bg-marron text-white font-bold py-3 rounded-xl active:scale-95 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── ANOTAR UN MOVIMIENTO — el cajón y la cuenta ───────────
          Antes estaba duplicado en las dos pantallas, así que había que
          decidir en cuál entrar antes de saber a cuál pertenecía el
          movimiento. Aquí se elige la bolsa y ya.

          La tarjeta queda fuera: un cargo no mueve dinero el día que se
          hace, así que se anota en su propia pestaña. */}
      {pestana !== 'tarjeta' && (
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

        {cuenta && cuenta.movimientos.length > 0 && (() => {
          /**
           * En el cajón se ve HOY, que es lo que se está cortando; en la
           * cuenta, el rango elegido. "Todos" queda a un toque para cuando
           * se busca algo viejo.
           */
          const hoy = diaISO(0);
          const delPeriodo =
            verMovs === 'todos'
              ? cuenta.movimientos
              : pestana === 'efectivo'
                ? cuenta.movimientos.filter((m) => m.fecha === hoy)
                : cuenta.movimientos;
          // Dos textos: uno para titular la lista y otro que cierre bien la
          // frase de "Sacaste $X ___", que con uno solo salía torcida.
          const etiqueta =
            verMovs === 'todos'
              ? 'todos'
              : pestana === 'efectivo'
                ? 'los de hoy'
                : `del ${desde.slice(5)} al ${hasta.slice(5)}`;
          const cuando =
            verMovs === 'todos'
              ? 'en total'
              : pestana === 'efectivo'
                ? 'hoy'
                : `del ${desde.slice(5)} al ${hasta.slice(5)}`;
          const sacado = delPeriodo
            .filter((m) => m.tipo === 'Salida')
            .reduce((t, m) => t + m.monto, 0);

          return (
            <>
              <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
                <p className="text-xs font-semibold text-neutral-800">
                  Movimientos: <span className="font-normal">{etiqueta}</span>
                </p>
                <button
                  onClick={() => setVerMovs((v) => (v === 'todos' ? 'periodo' : 'todos'))}
                  className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 active:scale-95"
                >
                  {verMovs === 'todos' ? 'Solo este periodo' : 'Ver todos'}
                </button>
              </div>

              {sacado > 0 && (
                <p className="text-sm font-semibold text-red-700">
                  Sacaste {money(sacado)} {cuando}
                </p>
              )}

              {delPeriodo.length === 0 ? (
                <p className="text-sm text-neutral-700">
                  No hay movimientos {cuando === 'en total' ? 'todavía' : cuando}.{' '}
                  <button
                    onClick={() => setVerMovs('todos')}
                    className="font-bold underline text-marron"
                  >
                    Ver todos
                  </button>
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {delPeriodo.map((m) => (
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
              )}
              <p className="text-xs text-neutral-600">
                Los 💵 cuentan en el corte del cajón; los 🏦, en el saldo de la cuenta.
                {verMovs === 'periodo' && pestana === 'cuenta' && ' El periodo se cambia arriba.'}
              </p>
            </>
          );
        })()}
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
