'use client';

import { useCallback, useEffect, useState } from 'react';

interface Chat {
  id: string;
  nombre: string;
}

interface Estado {
  botConfigurado: boolean;
  tieneDestinatarios: boolean;
  chats: Chat[];
}

export default function AvisosPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [mensajePrueba, setMensajePrueba] = useState('');
  const [copiado, setCopiado] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    fetch('/api/admin/telegram')
      .then((res) => res.json())
      .then((data) => setEstado(data))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enviarPrueba = async () => {
    setProbando(true);
    setMensajePrueba('');
    try {
      const res = await fetch('/api/admin/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'test' }),
      });
      const data = await res.json();
      setMensajePrueba(
        data.success ? '✅ Mensaje enviado. Revisa tu Telegram.' : `⚠️ ${data.error || 'No se pudo enviar'}`
      );
    } finally {
      setProbando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      setTimeout(() => setCopiado(''), 2000);
    } catch {}
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-bold text-neutral-900 text-lg">🔔 Avisos de pedidos por Telegram</h2>
        <p className="text-sm text-neutral-700 mt-1">
          Recibe un mensaje en tu Telegram cada vez que entra un pedido desde la app.
        </p>
      </div>

      {cargando ? (
        <p className="text-neutral-700 animate-pulse">Cargando...</p>
      ) : (
        <>
          {/* Estado */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-700">Bot configurado (TELEGRAM_BOT_TOKEN)</span>
              <span className={`text-sm font-semibold ${estado?.botConfigurado ? 'text-green-600' : 'text-red-600'}`}>
                {estado?.botConfigurado ? '✅ Sí' : '❌ No'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-700">Destinatario configurado (TELEGRAM_CHAT_ID)</span>
              <span className={`text-sm font-semibold ${estado?.tieneDestinatarios ? 'text-green-600' : 'text-red-600'}`}>
                {estado?.tieneDestinatarios ? '✅ Sí' : '❌ No'}
              </span>
            </div>

            {estado?.botConfigurado && estado?.tieneDestinatarios && (
              <button
                onClick={enviarPrueba}
                disabled={probando}
                className="w-full mt-2 bg-black text-white font-semibold py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {probando ? 'Enviando...' : 'Enviar mensaje de prueba'}
              </button>
            )}
            {mensajePrueba && <p className="text-sm text-neutral-700">{mensajePrueba}</p>}
          </div>

          {/* Detección de chat id */}
          {estado?.botConfigurado && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
              <p className="font-semibold text-neutral-900 mb-1">Tu chat id</p>
              <p className="text-xs text-neutral-700 mb-3">
                Abre tu bot en Telegram y envíale cualquier mensaje. Luego actualiza esta página y aquí
                aparecerá tu chat id — cópialo y ponlo en la variable <code>TELEGRAM_CHAT_ID</code> en Vercel.
              </p>
              {estado.chats.length === 0 ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-neutral-700">
                    Aún no detecto ningún chat. Escríbele al bot y pulsa actualizar.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {estado.chats.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 border border-neutral-100"
                    >
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{c.nombre || 'Chat'}</p>
                        <p className="font-mono text-sm text-neutral-600">{c.id}</p>
                      </div>
                      <button
                        onClick={() => copiar(c.id)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                          copiado === c.id ? 'bg-green-600 text-white' : 'bg-black text-white'
                        }`}
                      >
                        {copiado === c.id ? '✓ Copiado' : 'Copiar id'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={cargar}
                className="mt-3 text-sm font-semibold text-neutral-600 bg-neutral-100 px-4 py-2 rounded-xl active:scale-95 transition-transform"
              >
                🔄 Actualizar
              </button>
            </div>
          )}

          {/* Instrucciones */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900 space-y-2">
            <p className="font-semibold">¿Cómo activarlo? (una sola vez)</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li>En Telegram, busca <b>@BotFather</b>, envía <b>/newbot</b> y sigue los pasos. Te dará un <b>token</b>.</li>
              <li>En Vercel → Settings → Environment Variables, crea <code>TELEGRAM_BOT_TOKEN</code> con ese token y haz redeploy.</li>
              <li>Abre tu nuevo bot en Telegram y envíale cualquier mensaje.</li>
              <li>Vuelve aquí, actualiza y copia tu <b>chat id</b>.</li>
              <li>En Vercel crea <code>TELEGRAM_CHAT_ID</code> con ese id (varios separados por coma) y haz redeploy.</li>
              <li>Usa "Enviar mensaje de prueba" para confirmar.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
