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
}

// Orden y presentación fija del corte de caja; 'Sin registrar' solo se
// muestra si hay pedidos sin método asignado.
const METODOS_CORTE = [
  { clave: 'Efectivo', icono: '💵' },
  { clave: 'Terminal', icono: '💳' },
  { clave: 'Transferencia', icono: '📲' },
  { clave: 'Mercado Pago', icono: '🛍️' },
  { clave: 'Sin registrar', icono: '❔' },
];

// Filas que solo se muestran cuando tienen datos
const METODOS_CONDICIONALES = ['Mercado Pago', 'Sin registrar'];


// Atajos de rango rápidos
const restarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
};

export default function MetricasPage() {
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
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-neutral-500 ml-auto">
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
          <span className="text-xs font-semibold text-neutral-500 w-full pt-2">Exportar a Excel</span>
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
        <p className="text-neutral-500 animate-pulse">Cargando métricas...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tarjetas.map((t) => (
              <div key={t.label} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
                <div className="text-2xl mb-2">{t.icon}</div>
                <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">{t.label}</p>
                <p className="text-xl font-bold text-black mt-1 break-words">{t.valor}</p>
              </div>
            ))}
          </div>

          {metricas && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide mb-3">
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
                        <span className="text-neutral-400 ml-1.5">
                          ({pedidos} pedido{pedidos === 1 ? '' : 's'})
                        </span>
                      </span>
                      <span className="font-bold text-black tabular-nums">${total.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              {metricas.ventasPorMetodo?.['Sin registrar'] && (
                <p className="text-xs text-neutral-400 mt-3">
                  💡 "Sin registrar" son pedidos sin método de pago asignado — puedes ponérselo desde el detalle del pedido al cobrar.
                </p>
              )}

              {metricas.reembolsos?.pedidos > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-700">
                      💸 Reembolsado
                      <span className="text-neutral-400 ml-1.5">
                        ({metricas.reembolsos.pedidos} pedido{metricas.reembolsos.pedidos === 1 ? '' : 's'})
                      </span>
                    </span>
                    <span className="font-bold text-red-700 tabular-nums">
                      −${metricas.reembolsos.total.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
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
