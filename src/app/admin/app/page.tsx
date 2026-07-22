'use client';

/**
 * APP: qué ha cambiado en la aplicación.
 *
 * Para que quien entra al panel sepa qué es nuevo sin tener que
 * preguntarlo. Se lee de src/lib/cambios.ts, escrito en español de
 * negocio, no de los mensajes de git.
 */

import { useState } from 'react';
import { CAMBIOS, ETIQUETA_TIPO, type TipoCambio } from '@/lib/cambios';

const FILTROS: { valor: TipoCambio | 'todos'; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todo' },
  { valor: 'nuevo', etiqueta: '✨ Nuevo' },
  { valor: 'mejora', etiqueta: '⬆️ Mejoras' },
  { valor: 'arreglo', etiqueta: '🔧 Arreglos' },
  { valor: 'aviso', etiqueta: '⚠️ Ojo' },
];

/** '2026-07-22' → '22 jul 2026', sin pasar por Date (zonas horarias) */
function fechaBonita(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1] ?? ''} ${y}`;
}

export default function AppPage() {
  const [filtro, setFiltro] = useState<TipoCambio | 'todos'>('todos');

  const visibles = filtro === 'todos' ? CAMBIOS : CAMBIOS.filter((c) => c.tipo === filtro);

  // Agrupados por día, del más reciente al más viejo
  const porFecha = [...new Set(visibles.map((c) => c.fecha))]
    .sort((a, b) => b.localeCompare(a))
    .map((fecha) => ({ fecha, items: visibles.filter((c) => c.fecha === fecha) }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        Lo que ha cambiado en la app, de lo más reciente a lo más viejo. Si algo se ve distinto a
        como lo recordabas, seguramente está aquí.
      </p>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              filtro === f.valor ? 'bg-marron text-white' : 'bg-white border border-neutral-200 text-neutral-600'
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {porFecha.map(({ fecha, items }) => (
          <div key={fecha}>
            <p className="text-xs font-bold text-neutral-600 uppercase tracking-wide mb-2">
              {fechaBonita(fecha)}
            </p>
            <div className="space-y-2">
              {items.map((c, i) => (
                <div
                  key={`${fecha}-${i}`}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100"
                >
                  <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ETIQUETA_TIPO[c.tipo].color}`}
                    >
                      {ETIQUETA_TIPO[c.tipo].texto}
                    </span>
                    <h3 className="font-bold text-neutral-900 leading-tight flex-1 min-w-0">
                      {c.titulo}
                    </h3>
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed">{c.detalle}</p>
                  {c.donde && (
                    <p className="text-[11px] text-neutral-600 mt-1.5">📍 {c.donde}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {visibles.length === 0 && (
          <p className="text-center text-neutral-600 py-8">Nada de este tipo todavía.</p>
        )}
      </div>
    </div>
  );
}
