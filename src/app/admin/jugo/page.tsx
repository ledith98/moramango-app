'use client';

/**
 * Jugo del día: un solo lugar donde se fija, con tres salidas —
 * el banner de la tienda, el aviso de Telegram y una imagen para redes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Estado {
  actual: { jugo: string; nota: string; fecha: string; vigente: boolean } | null;
  jugos: string[];
}

export default function JugoDelDiaPage() {
  const [jugos, setJugos] = useState<string[]>([]);
  const [actual, setActual] = useState<Estado['actual']>(null);
  const [jugo, setJugo] = useState('');
  const [nota, setNota] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const cargar = useCallback(async () => {
    const res = await fetch('/api/admin/jugo-del-dia');
    const data: Estado = await res.json();
    setJugos(data.jugos ?? []);
    setActual(data.actual);
    if (data.actual?.vigente) {
      setJugo(data.actual.jugo);
      setNota(data.actual.nota);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar() {
    if (!jugo.trim()) return;
    setGuardando(true);
    const res = await fetch('/api/admin/jugo-del-dia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jugo, nota }),
    });
    setGuardando(false);
    if (res.ok) {
      setOk(true);
      setTimeout(() => setOk(false), 2500);
      cargar();
    }
  }

  async function quitar() {
    if (!confirm('¿Quitar el jugo del día? Dejará de verse en la tienda.')) return;
    await fetch('/api/admin/jugo-del-dia', { method: 'DELETE' });
    setJugo('');
    setNota('');
    cargar();
  }

  function descargarImagen() {
    const svg = svgRef.current;
    if (!svg) return;
    const datos = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([datos], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 1080;
      c.height = 1920;
      c.getContext('2d')!.drawImage(img, 0, 0, 1080, 1920);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `moramango-jugo-${jugo.trim().toLowerCase() || 'del-dia'}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.src = url;
  }

  if (cargando) return <p className="text-neutral-700 animate-pulse">Cargando…</p>;

  const nombre = jugo.trim() || 'Elige un jugo';

  return (
    <div className="space-y-5 max-w-5xl">
      <p className="text-sm text-neutral-700">
        Fija el jugo de hoy: aparece como banner en la tienda, se avisa al grupo de Telegram y de
        aquí descargas la imagen lista para tus historias.
      </p>

      {actual && !actual.vigente && actual.jugo && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-800">
          El último jugo que fijaste fue <b>{actual.jugo}</b> el {actual.fecha}. Hoy todavía no has
          puesto ninguno, así que la tienda no muestra banner.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Editor */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-2">
              Jugo del día
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {jugos.map((j) => (
                <button
                  key={j}
                  onClick={() => setJugo(j)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                    jugo.trim().toLowerCase() === j.toLowerCase()
                      ? 'bg-marron text-white'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {j}
                </button>
              ))}
            </div>
            <input
              value={jugo}
              onChange={(e) => setJugo(e.target.value)}
              placeholder="O escribe uno nuevo (ej. Guayaba)"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-2">
              Nota <span className="font-normal text-neutral-500">(opcional)</span>
            </label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. ¡Recién exprimido! · $10 de descuento"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm text-neutral-900 placeholder-neutral-500 focus:outline-none focus:border-marron"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={guardar}
              disabled={guardando || !jugo.trim()}
              className="flex-1 bg-marron text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : ok ? '✅ Guardado' : 'Fijar jugo de hoy'}
            </button>
            {actual?.vigente && (
              <button
                onClick={quitar}
                className="px-4 text-sm font-semibold text-red-600 bg-red-50 rounded-xl active:scale-95"
              >
                Quitar
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            Al fijarlo se manda solo el aviso a Telegram. El banner en la tienda se quita solo al
            día siguiente si no pones otro.
          </p>
        </div>

        {/* Vista previa + descarga para redes */}
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden shadow-sm border border-neutral-100 mx-auto"
            style={{ width: 270 }}>
            <svg ref={svgRef} viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg"
              style={{ display: 'block', width: '100%' }}>
              <defs>
                <linearGradient id="jd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fbbb3a" />
                  <stop offset="0.45" stopColor="#f08a2c" />
                  <stop offset="1" stopColor="#6a2749" />
                </linearGradient>
                <filter id="jdsombra" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#4a2617" floodOpacity="0.4" />
                </filter>
                <filter id="jdpanel" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="20" stdDeviation="30" floodColor="#3a1c10" floodOpacity="0.35" />
                </filter>
              </defs>
              <rect width="1080" height="1920" fill="url(#jd)" />
              <ellipse cx="880" cy="330" rx="230" ry="230" fill="#fbc456" opacity="0.3" />
              <ellipse cx="200" cy="1500" rx="240" ry="240" fill="#c94b34" opacity="0.28" />

              <text x="540" y="430" textAnchor="middle" fill="#fff7e9" opacity="0.9"
                fontFamily="'Trebuchet MS',sans-serif" fontSize="34" fontWeight="700"
                letterSpacing="8">MORAMANGO</text>
              <text x="540" y="640" textAnchor="middle" fill="#fff7e9" filter="url(#jdsombra)"
                fontFamily="'Arial Black',sans-serif" fontWeight="900" fontSize="96"
                letterSpacing="-2">JUGO DEL DÍA</text>
              <text x="540" y="740" textAnchor="middle" fill="#ffd885"
                fontFamily="'Trebuchet MS',sans-serif" fontSize="46" fontWeight="700">
                natural y recién hecho 🍊</text>

              {/* Panel con el nombre del jugo */}
              <g filter="url(#jdpanel)">
                <rect x="130" y="900" width="820" height="360" rx="46" fill="#fff7e9" />
              </g>
              <text x="540" y="1090" textAnchor="middle" fill="#6a2749"
                fontFamily="'Arial Black',sans-serif" fontWeight="900"
                fontSize={nombre.length > 12 ? 96 : 128} letterSpacing="-2">
                {nombre.toUpperCase()}
              </text>
              {nota.trim() && (
                <text x="540" y="1185" textAnchor="middle" fill="#8a5a34"
                  fontFamily="'Trebuchet MS',sans-serif" fontSize="40" fontWeight="700">
                  {nota.trim().slice(0, 34)}
                </text>
              )}

              <text x="540" y="1470" textAnchor="middle" fill="#fff7e9"
                fontFamily="'Trebuchet MS',sans-serif" fontSize="46" fontWeight="800">
                Pídelo en línea 🥭</text>
              <g filter="url(#jdpanel)">
                <rect x="256" y="1520" width="568" height="86" rx="43" fill="#fff7e9" />
              </g>
              <text x="540" y="1576" textAnchor="middle" fill="#5c3a21"
                fontFamily="'Trebuchet MS',sans-serif" fontSize="39" fontWeight="700">
                moramango-app.vercel.app</text>
            </svg>
          </div>
          <button
            onClick={descargarImagen}
            disabled={!jugo.trim()}
            className="w-full bg-neutral-900 text-white font-semibold py-3 rounded-xl active:scale-95 disabled:opacity-50"
          >
            📲 Descargar imagen para redes
          </button>
          <p className="text-[11px] text-neutral-500 text-center">
            Imagen 1080×1920, lista para historia de Instagram, WhatsApp y Facebook.
          </p>
        </div>
      </div>
    </div>
  );
}
