'use client';

import { useEffect, useState } from 'react';

interface Metricas {
  fecha: string;
  totalVentas: number;
  numPedidos: number;
  ticketPromedio: number;
  productoMasVendido: { nombre: string; cantidad: number } | null;
  pedidosCancelados: number;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function MetricasPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/admin/metricas?fecha=${fecha}`)
      .then((res) => res.json())
      .then((data) => setMetricas(data))
      .finally(() => setCargando(false));
  }, [fecha]);

  const tarjetas = metricas
    ? [
        { label: 'Ventas del día', valor: `$${metricas.totalVentas.toFixed(2)}`, icon: '💰' },
        { label: 'Pedidos del día', valor: metricas.numPedidos, icon: '🧾' },
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
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex items-center gap-3">
        <label className="text-sm font-semibold text-neutral-700">Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
        />
        {metricas && metricas.pedidosCancelados > 0 && (
          <span className="text-xs text-neutral-500 ml-auto">
            ({metricas.pedidosCancelados} cancelado{metricas.pedidosCancelados === 1 ? '' : 's'}, no incluido{metricas.pedidosCancelados === 1 ? '' : 's'})
          </span>
        )}
      </div>

      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando métricas...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tarjetas.map((t) => (
            <div key={t.label} className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <div className="text-2xl mb-2">{t.icon}</div>
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">{t.label}</p>
              <p className="text-xl font-bold text-black mt-1 break-words">{t.valor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
