'use client';

import { useCallback, useEffect, useState } from 'react';

interface ClienteInactivo {
  id: string;
  nombre: string;
  telefono: string;
  ultimaCompra: string | null;
  diasSinComprar: number;
  beneficioActivo: string | null;
}

const linkWhatsApp = (telefono: string, mensaje: string): string =>
  `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`;

export default function ReactivacionPage() {
  const [inactivos, setInactivos] = useState<ClienteInactivo[]>([]);
  const [umbral, setUmbral] = useState(45);
  const [monto, setMonto] = useState(20);
  const [vigenciaDias, setVigenciaDias] = useState(15);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState<string | null>(null);
  const [generados, setGenerados] = useState<Record<string, { monto: number; vence: string }>>({});

  const cargar = useCallback(() => {
    setCargando(true);
    fetch(`/api/admin/clientes-inactivos?dias=${umbral}`)
      .then((res) => res.json())
      .then((data) => setInactivos(data.inactivos || []))
      .finally(() => setCargando(false));
  }, [umbral]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const generarYEnviar = async (cliente: ClienteInactivo) => {
    setGenerando(cliente.id);
    try {
      const res = await fetch('/api/admin/reactivacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: cliente.id, monto, diasVigencia: vigenciaDias }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }

      setGenerados((prev) => ({ ...prev, [cliente.id]: { monto: data.monto, vence: data.vence } }));

      if (cliente.telefono) {
        const primerNombre = (cliente.nombre || '').trim().split(' ')[0] || 'hola';
        const mensaje =
          `¡Hola ${primerNombre}! 💛 Te extrañamos en Moramango. ` +
          `Tenemos $${data.monto} de descuento esperándote en tu próximo pedido — ` +
          `ya está aplicado directo en tu cuenta, solo inicia sesión y pide. ` +
          `Válido hasta el ${data.vence}. ¡Te esperamos! 🥭`;
        window.open(linkWhatsApp(cliente.telefono, mensaje), '_blank');
      }
    } finally {
      setGenerando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-neutral-900 text-lg">💛 Campaña de reactivación</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Clientes que ya compraron antes pero no han vuelto. Genera un cupón de monto fijo — se
          aplica directo en su cuenta — y avísales por WhatsApp.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-neutral-700">Sin comprar por más de</label>
          <input
            type="number"
            min={1}
            value={umbral}
            onChange={(e) => setUmbral(parseInt(e.target.value) || 45)}
            className="w-20 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          />
          <span className="text-sm text-neutral-500">días</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-neutral-700">Cupón de</label>
          <span className="text-sm text-neutral-500">$</span>
          <input
            type="number"
            min={1}
            value={monto}
            onChange={(e) => setMonto(parseInt(e.target.value) || 20)}
            className="w-20 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-neutral-700">Vigencia</label>
          <input
            type="number"
            min={1}
            value={vigenciaDias}
            onChange={(e) => setVigenciaDias(parseInt(e.target.value) || 15)}
            className="w-20 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
          />
          <span className="text-sm text-neutral-500">días</span>
        </div>
        <span className="text-xs text-neutral-400 ml-auto">{inactivos.length} clientes</span>
      </div>

      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Buscando clientes inactivos...</p>
      ) : inactivos.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-neutral-100">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-neutral-500">Ningún cliente lleva más de {umbral} días sin comprar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 divide-y divide-neutral-100">
          {inactivos.map((c) => {
            const generado = generados[c.id];
            const yaTiene = c.beneficioActivo || generado;
            return (
              <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">{c.nombre || c.id}</p>
                  <p className="text-xs text-neutral-500">
                    {c.telefono || 'sin teléfono'} · {c.diasSinComprar} días sin comprar
                  </p>
                  {yaTiene && (
                    <p className="text-xs font-semibold text-green-600 mt-1">
                      {generado
                        ? `✓ Cupón de $${generado.monto} enviado — vence ${generado.vence}`
                        : `Ya tiene un beneficio activo: ${c.beneficioActivo}`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => generarYEnviar(c)}
                  disabled={generando === c.id || !!yaTiene}
                  className="shrink-0 bg-marron text-white text-sm font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                >
                  {generando === c.id
                    ? 'Generando...'
                    : yaTiene
                    ? '✓ Enviado'
                    : c.telefono
                    ? '💛 Generar y enviar'
                    : '💛 Generar cupón'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
