/**
 * telegram.ts
 *
 * Avisos a Telegram cuando entra un pedido nuevo desde la app.
 *
 * Configuración (variables de entorno):
 * - TELEGRAM_BOT_TOKEN: token del bot creado con @BotFather.
 * - TELEGRAM_CHAT_ID: uno o varios chat id (separados por coma) que
 *   recibirán los avisos.
 *
 * Si no está configurado, todo degrada silenciosamente: los pedidos se
 * crean igual, simplemente no se manda aviso.
 */

const API = 'https://api.telegram.org';

export function telegramConfigurado(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function chatIds(): string[] {
  return (process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tieneDestinatarios(): boolean {
  return chatIds().length > 0;
}

/**
 * Envía un mensaje a todos los chat id configurados. Nunca lanza: si
 * falla el envío, solo se registra en logs (no debe romper el pedido).
 */
export async function enviarTelegram(texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ids = chatIds();
  if (!token || ids.length === 0) return;

  await Promise.all(
    ids.map((id) =>
      fetch(`${API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: id,
          text: texto,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
        .then(async (res) => {
          if (!res.ok) console.error('Telegram sendMessage', res.status, await res.text());
        })
        .catch((e) => console.error('Telegram sendMessage error:', e))
    )
  );
}

/**
 * Devuelve los chats que le han escrito al bot recientemente (para que
 * el admin descubra su chat id durante la configuración inicial).
 */
export async function detectarChats(): Promise<{ id: string; nombre: string }[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [];

  const res = await fetch(`${API}/bot${token}/getUpdates`);
  if (!res.ok) return [];

  const data = await res.json();
  const encontrados = new Map<string, string>();
  for (const u of data.result || []) {
    const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
    if (chat?.id) {
      const nombre =
        chat.title ||
        [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
        chat.username ||
        '';
      encontrados.set(String(chat.id), nombre);
    }
  }
  return [...encontrados.entries()].map(([id, nombre]) => ({ id, nombre }));
}
