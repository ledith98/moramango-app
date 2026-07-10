'use client';

import { useEffect, useState } from 'react';

interface Metricas {
  fecha: string;
  totalVentas: number;
  numPedidos: number;
  ticketPromedio: number;
  productoMasVendido: { nombre: string; cantidad: number } | null;
  ventasPorMetodo: Record<string, { total: number; pedidos: number }>;
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
