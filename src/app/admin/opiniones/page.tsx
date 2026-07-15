'use client';

import { useEffect, useState } from 'react';

interface Opinion {
  id: string;
  idPedido: string;
  cliente: string;
  anonimo: boolean;
  sabor: number;
  calidad: number;
  comentario: string;
  fecha: string;
}

interface Datos {
  opiniones: Opinion[];
  promedios: { sabor: number; calidad: number } | null;
  total: number;
}

const estrellas = (n: number) => '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

// Verde si va bien, ámbar si es regular, rojo si hay que atenderlo
const colorNota = (n: number) =>
  n >= 4 ? 'text-green-600' : n >= 3 ? 'text-amber-600' : 'text-red-600';

export default function OpinionesPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [soloBajas, setSoloBajas] = useState(false);

  useEffect(() => {
    fetch('/api/admin/opiniones')
      .then((res) => res.json())
      .then((d) => setDatos(d))
      .finally(() => setCargando(false));
  }, []);

  const lista = (datos?.opiniones || []).filter(
    (o) => !soloBajas || (o.sabor + o.calidad) / 2 <= 3
  );

  return (
    <div className="space-y-6">
      {cargando ? (
        <p className="text-neutral-500 animate-pulse">Cargando opiniones...</p>
      ) : !datos || datos.total === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-neutral-100">
          <div className="text-5xl mb-3">⭐</div>
          <p className="text-neutral-500">Todavía no hay opiniones.</p>
          <p className="text-xs text-neutral-400 mt-2">
            Se le pide su opinión al cliente cuando su pedido pasa a "Entregado".
          </p>
        </div>
      ) : (
        <>
          {/* Promedios */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Sabor</p>
              <p className={`text-2xl font-bold mt-1 ${colorNota(datos.promedios!.sabor)}`}>
                {datos.promedios!.sabor.toFixed(1)} / 5
              </p>
              <p className="text-sm mt-1">{estrellas(Math.round(datos.promedios!.sabor))}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Calidad</p>
              <p className={`text-2xl font-bold mt-1 ${colorNota(datos.promedios!.calidad)}`}>
                {datos.promedios!.calidad.toFixed(1)} / 5
              </p>
              <p className="text-sm mt-1">{estrellas(Math.round(datos.promedios!.calidad))}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wide">Opiniones</p>
              <p className="text-2xl font-bold text-black mt-1">{datos.total}</p>
              <button
                onClick={() => setSoloBajas((v) => !v)}
                className={`mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                  soloBajas ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {soloBajas ? '✓ Solo las bajas' : 'Ver solo las bajas'}
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {lista.length === 0 ? (
              <p className="text-neutral-500 text-center py-6">
                Ninguna opinión baja. 🎉
              </p>
            ) : (
              lista.map((o) => {
                const promedio = (o.sabor + o.calidad) / 2;
                return (
                  <div
                    key={o.id}
                    className={`bg-white rounded-2xl p-4 shadow-sm border ${
                      promedio <= 3 ? 'border-red-200' : 'border-neutral-100'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-900">
                          {o.anonimo ? '🕶️ ' : '👤 '}
                          {o.cliente}
                        </p>
                        <p className="text-xs text-neutral-400 font-mono">{o.idPedido}</p>
                      </div>
                      <span className="text-xs text-neutral-400 shrink-0">{o.fecha}</span>
                    </div>

                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="text-neutral-600">
                        Sabor <span className={colorNota(o.sabor)}>{estrellas(o.sabor)}</span>
                      </span>
                      <span className="text-neutral-600">
                        Calidad <span className={colorNota(o.calidad)}>{estrellas(o.calidad)}</span>
                      </span>
                    </div>

                    {o.comentario && (
                      <p className="mt-2 text-sm text-neutral-700 bg-neutral-50 rounded-xl p-3 italic">
                        "{o.comentario}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
