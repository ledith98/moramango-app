'use client';

import { useEffect, useState } from 'react';
import { fechaHoyMTY } from '@/lib/pedidoFecha';

interface Metricas {
  desde: string;
  hasta: string;
  totalVentas: number;
  numPedidos: number;
  ticketPromedio: number;
  productoMasVendido: { nombre: string; cantidad: number } | null;
  ventasPorMetodo: Record<string, { total: number; pedidos: number }>;
  reembolsos: { total: number; pedidos: number };
  pedidosCancelados: number;
  comisionTerminal: { ventaBruta: number; comision: number; neto: number; cobros: number };
  /** Desglose por metodo: la terminal y el pago en linea no cobran igual */
  comisionPorMetodo?: {
    metodo: string;
    tarifa: string;
    ventaBruta: number;
    comision: number;
    neto: number;
    cobros: number;
  }[];
  totalNeto: number;
}

// Orden y presentación fija del corte de caja; 'Sin registrar' solo se
// muestra si hay pedidos sin método asignado.
const METODOS_CORTE = [
  { clave: 'Efectivo', icono: '💵' },
  { clave: 'Terminal', icono: '💳' },
  { clave: 'Transferencia', icono: '📲' },
  { clave: 'Pago en línea', icono: '🛍️' },
  { clave: 'Sin registrar', icono: '❔' },
];

// Filas que solo se muestran cuando tienen datos
const METODOS_CONDICIONALES = ['Pago en línea', 'Sin registrar'];


// Atajos de rango rápidos
const restarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
};

export default function MetricasPage() {
  const [enviandoCorte, setEnviandoCorte] = useState(false);
  const [corteEnviado, setCorteEnviado] = useState(false);

  /** Manda el resumen del día a Telegram sin esperar a la hora del cierre. */
  const enviarCorte = async () => {
    setEnviandoCorte(true);
    try {
      const r = await fetch('/api/admin/corte', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'No se pudo enviar');
        return;
      }
      if (!d.enviado) {
        alert(d.motivo || 'Hoy no hay nada que reportar todavía.');
        return;
      }
      setCorteEnviado(true);
      setTimeout(() => setCorteEnviado(false), 3000);
    } finally {
      setEnviandoCorte(false);
    }
  };

  const hoy = fechaHoyMTY();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/admin/metricas?desde=${desde}&hasta=${hasta}`)
      .then((res) => res.json())
      .then((data) => setMetricas(data))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const aplicarRango = (dias: number) => {
    const h = fechaHoyMTY();
    setHasta(h);
    setDesde(dias === 0 ? h : restarDias(h, dias));
  };

  const exportar = (detalle: boolean) => {
    const params = new URLSearchParams({ desde, hasta });
    if (detalle) params.set('detalle', '1');
    // Descarga directa: el endpoint responde con Content-Disposition attachment
    window.location.href = `/api/admin/reportes/ventas?${params}`;
  };

  const unDia = desde === hasta;

  const tarjetas = metricas
    ? [
        { label: unDia ? 'Ventas del día' : 'Ventas del periodo', valor: `$${metricas.totalVentas.toFixed(2)}`, icon: '💰' },
        { label: unDia ? 'Pedidos del día' : 'Pedidos del periodo', valor: metricas.numPedidos, icon: '🧾' },
        {
          label: 'Producto más vendido',
          valor: metricas.productoMasVendido
            ? `${metricas.productoMasVendido.nombre} (${metricas.productoMasVendido.cantidad})`
            : '—',
          icon: '⭐',
        },
        { label: 'Ticket promedio', valor: `$${metricas.ticketPromedio.toFixed(2)}`, icon: '📈' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-neutral-700">Desde</label>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>
          <div className="flex items-center gap-2 text-neutral-900">
            <label className="text-sm font-semibold text-neutral-700">Hasta</label>
            <input
              type="date"
              value={hasta}
              min={desde}
              max={hoy}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
            />
          </div>
          {metricas && metricas.pedidosCancelados > 0 && (
            <span className="text-xs text-neutral-700 ml-auto">
              ({metricas.pedidosCancelados} cancelado{metricas.pedidosCancelados === 1 ? '' : 's'}, no incluido{metricas.pedidosCancelados === 1 ? '' : 's'})
            </span>
          )}
        </div>

        {/* Atajos de rango */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Hoy', dias: 0 },
            { label: 'Últimos 7 días', dias: 6 },
            { label: 'Últimos 30 días', dias: 29 },
          ].map((r) => (
            <button
              key={r.label}
              onClick={() => aplicarRango(r.dias)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 active:scale-95 transition-transform"
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Exportar */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-neutral-100">
          <span className="text-xs font-semibold text-neutral-700 w-full pt-2">Exportar a Excel</span>
          <button
            onClick={() => exportar(false)}
            className="text-sm font-semibold px-3 py-2 rounded-xl bg-black text-white active:scale-95 transition-transform"
          >
            📊 Ventas (por pedido)
          </button>
          <button
            onClick={() => exportar(true)}
            className="text-sm font-semibold px-3 py-2 rounded-xl bg-neutral-100 text-neutral-700 active:scale-95 transition-transform"
          >
            📋 Detalle (por producto)
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="text-neutral-700 animate-pulse">Cargando métricas...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tarjetas.map((t) => (
              <div key={t.label} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <div className="text-2xl mb-2">{t.icon}</div>
                <p className="text-xs text-neutral-700 font-medium uppercase tracking-wide">{t.label}</p>
                <p className="text-xl font-bold text-black mt-1 break-words">{t.valor}</p>
              </div>
            ))}
          </div>

          {metricas && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-neutral-900">🧾 Corte del día por Telegram</p>
                <p className="text-xs text-neutral-700 mt-0.5">
                  Ventas, cómo te pagaron, la comisión, los cobros sin confirmar y qué insumo se
                  acabó — todo en un mensaje. Te llega solo cada noche a las 9.
                </p>
              </div>
              <button
                onClick={enviarCorte}
                disabled={enviandoCorte}
                className="shrink-0 bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl active:scale-95 disabled:opacity-50"
              >
                {enviandoCorte ? 'Enviando…' : corteEnviado ? '✅ Enviado' : 'Mandármelo ahora'}
              </button>
            </div>
          )}

          {metricas && metricas.comisionTerminal && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-700 font-medium uppercase tracking-wide">
                Lo que se queda Mercado Pago
              </p>
              <p className="text-xs text-neutral-600 mt-0.5 mb-3">
                De los cobros con tarjeta y en línea. El efectivo y las transferencias no pagan
                nada.
              </p>

              {metricas.comisionTerminal.cobros === 0 ? (
                <p className="text-sm text-neutral-700">
                  No hubo cobros con tarjeta ni en línea en este periodo.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {/* Desglose por metodo: cada uno cobra distinto, y
                        verlos juntos escondia que el pago en linea sale
                        mucho mas caro en las ventas chicas. */}
                    {(metricas.comisionPorMetodo ?? []).map((r) => (
                      <div key={r.metodo} className="py-1.5 border-b border-neutral-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-neutral-900">
                            {r.metodo === 'Terminal' ? '💳' : '🛍️'} {r.metodo}
                            <span className="font-normal text-neutral-600 ml-1.5">
                              ({r.cobros} cobro{r.cobros === 1 ? '' : 's'} · {r.tarifa})
                            </span>
                          </span>
                          <span className="font-bold text-black tabular-nums">
                            ${r.ventaBruta.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs mt-0.5">
                          <span className="text-red-700">
                            se llevó {((r.comision / r.ventaBruta) * 100).toFixed(1)}%
                          </span>
                          <span className="font-semibold text-red-700 tabular-nums">
                            −${r.comision.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between py-1.5 border-b border-neutral-50">
                      <span className="text-sm text-neutral-700">
                        Cobrado en total
                        <span className="text-neutral-600 ml-1.5">
                          ({metricas.comisionTerminal.cobros} cobro
                          {metricas.comisionTerminal.cobros === 1 ? '' : 's'})
                        </span>
                      </span>
                      <span className="font-bold text-black tabular-nums">
                        ${metricas.comisionTerminal.ventaBruta.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-neutral-50">
                      <span className="text-sm text-red-700">Comisión cobrada</span>
                      <span className="font-bold text-red-700 tabular-nums">
                        −${metricas.comisionTerminal.comision.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-sm font-semibold text-neutral-900">
                        Total menos comisión
                      </span>
                      <span className="font-bold text-green-700 tabular-nums text-lg">
                        ${metricas.comisionTerminal.neto.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-sm text-neutral-700">
                      Ventas del periodo ya sin comisión
                      <span className="block text-xs text-neutral-600">
                        Todas las formas de pago juntas
                      </span>
                    </span>
                    <span className="font-bold text-black tabular-nums">
                      ${metricas.totalNeto.toFixed(2)}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 mt-3">
                    💡 La terminal cobra solo el porcentaje, pero el pago en línea le suma $4 fijos
                    por venta. Por eso en línea un cobro de $50 se lleva casi 12% y uno de $200
                    baja a 6%: entre más chica la venta, más pesa.
                  </p>
                </>
              )}
            </div>
          )}

          {metricas && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-700 font-medium uppercase tracking-wide mb-3">
                Ingresos por método de pago
              </p>
              <div className="space-y-2">
                {METODOS_CORTE.map(({ clave, icono }) => {
                  const datos = metricas.ventasPorMetodo?.[clave];
                  if (METODOS_CONDICIONALES.includes(clave) && !datos) return null;
                  const total = datos?.total ?? 0;
                  const pedidos = datos?.pedidos ?? 0;
                  return (
                    <div key={clave} className="flex items-center justify-between py-1.5 border-b border-neutral-50 last:border-0">
                      <span className="text-sm text-neutral-700">
                        {icono} {clave}
                        <span className="text-neutral-600 ml-1.5">
                          ({pedidos} pedido{pedidos === 1 ? '' : 's'})
                        </span>
                      </span>
                      <span className="font-bold text-black tabular-nums">${total.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              {metricas.ventasPorMetodo?.['Sin registrar'] && (
                <p className="text-xs text-neutral-600 mt-3">
                  💡 "Sin registrar" son pedidos sin método de pago asignado — puedes ponérselo desde el detalle del pedido al cobrar.
                </p>
              )}

              {metricas.reembolsos?.pedidos > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-700">
                      💸 Reembolsado
                      <span className="text-neutral-600 ml-1.5">
                        ({metricas.reembolsos.pedidos} pedido{metricas.reembolsos.pedidos === 1 ? '' : 's'})
                      </span>
                    </span>
                    <span className="font-bold text-red-700 tabular-nums">
                      −${metricas.reembolsos.total.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1">
                    Dinero devuelto al cliente. Ya está descontado de los ingresos de arriba.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
