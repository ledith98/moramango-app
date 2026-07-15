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

type Criterio = 'promedio' | 'sabor' | 'calidad';

export default function OpinionesPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  // Filtros
  const [criterio, setCriterio] = useState<Criterio>('promedio');
  const [estrellasFiltro, setEstrellasFiltro] = useState<number | null>(null);
  const [soloConComentario, setSoloConComentario] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    fetch('/api/admin/opiniones')
      .then((res) => res.json())
      .then((d) => setDatos(d))
      .finally(() => setCargando(false));
  }, []);

  // Nota según el criterio elegido; el promedio se redondea para poder
  // agruparlo en estrellas enteras (ej. 3.5 cuenta como 4)
  const notaDe = (o: Opinion): number =>
    criterio === 'sabor' ? o.sabor : criterio === 'calidad' ? o.calidad : Math.round((o.sabor + o.calidad) / 2);

  const termino = busqueda.trim().toLowerCase();
  const lista = (datos?.opiniones || []).filter((o) => {
    if (estrellasFiltro !== null && notaDe(o) !== estrellasFiltro) return false;
    if (soloConComentario && !o.comentario.trim()) return false;
    if (termino && !o.comentario.toLowerCase().includes(termino) && !o.cliente.toLowerCase().includes(termino))
      return false;
    return true;
  });

  const hayFiltro = estrellasFiltro !== null || soloConComentario || termino !== '';
  const limpiar = () => {
    setEstrellasFiltro(null);
    setSoloConComentario(false);
    setBusqueda('');
  };

  // Cuántas opiniones hay por cada estrella (según el criterio activo)
  const conteoPorEstrella = (n: number) =>
    (datos?.opiniones || []).filter((o) => notaDe(o) === n).length;

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
              <p className="text-xs text-neutral-400 mt-1">
                {datos.opiniones.filter((o) => o.comentario.trim()).length} con comentario
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-neutral-700">Filtrar por</label>
              <select
                value={criterio}
                onChange={(e) => setCriterio(e.target.value as Criterio)}
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-2 text-sm text-neutral-700 focus:outline-none focus:border-black"
              >
                <option value="promedio">Promedio</option>
                <option value="sabor">Sabor</option>
                <option value="calidad">Calidad</option>
              </select>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEstrellasFiltro(null)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    estrellasFiltro === null ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  Todas
                </button>
                {[5, 4, 3, 2, 1].map((n) => {
                  const cuantas = conteoPorEstrella(n);
                  return (
                    <button
                      key={n}
                      onClick={() => setEstrellasFiltro(estrellasFiltro === n ? null : n)}
                      disabled={cuantas === 0}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-30 ${
                        estrellasFiltro === n
                          ? n <= 2 ? 'bg-red-600 text-white' : n === 3 ? 'bg-amber-500 text-white' : 'bg-green-600 text-white'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {n}⭐ <span className="opacity-60">({cuantas})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="🔎 Buscar en comentarios o cliente..."
                className="flex-1 min-w-[180px] bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-black"
              />
              <button
                onClick={() => setSoloConComentario((v) => !v)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
                  soloConComentario ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                💬 Solo con comentario
              </button>
              {hayFiltro && (
                <button
                  onClick={limpiar}
                  className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-3 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  ✕ Limpiar
                </button>
              )}
              <span className="text-xs text-neutral-500 ml-auto">
                {lista.length} de {datos.total}
              </span>
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {lista.length === 0 ? (
              <p className="text-neutral-500 text-center py-6">
                Ninguna opinión coincide con el filtro.
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
