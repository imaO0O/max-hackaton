/**
 * Оформление сообщений бота: заголовок (первая строка) и подписи разделов («Ближайшие даты:») — жирным.
 * Работает как обёртка над fetch клиента Bot API (clientOptions.fetch — публичная точка расширения SDK),
 * поэтому тексты и логика бота остаются обычным текстом. Выключается переменной BOT_RICH_TEXT=false.
 *
 * Сообщения со ссылками и командами (/plan) уходят обычным текстом: так ссылки и команды гарантированно
 * остаются нажимаемыми, в том числе в сообщении с планом, которое пересылают подростку.
 */

const SECTION_LABEL_RE = /^[^•\s][^:]{0,40}:$/;
const LINK_OR_COMMAND_RE = /https?:\/\/|(^|\s)\/[a-z_]+/m;

/** Можно ли оформить текст: без ссылок и команд, иначе оставляем как есть. */
export function canFormat(text) {
  return !LINK_OR_COMMAND_RE.test(text);
}

export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Обычный текст → HTML для MAX: всё экранировано, заголовок и подписи разделов жирные. */
export function toRichHtml(text) {
  const lines = escapeHtml(text).split('\n');
  return lines.map((line, index) => {
    const isTitle = index === 0 && lines.length > 1 && line.trim() !== '';
    const isSectionLabel = index > 0 && SECTION_LABEL_RE.test(line);
    return isTitle || isSectionLabel ? `<b>${line}</b>` : line;
  }).join('\n');
}

function formatMessageBody(message) {
  if (!message || typeof message.text !== 'string' || message.format || !canFormat(message.text)) return message;
  return { ...message, text: toRichHtml(message.text), format: 'html' };
}

/** fetch, который оформляет исходящие сообщения: POST /messages и ответы на кнопки POST /answers. */
export function richTextFetch(baseFetch) {
  return (url, init = {}) => {
    const { pathname } = new URL(url);
    const isMessage = pathname.endsWith('/messages') || pathname.endsWith('/answers');
    if (!isMessage || !init.body || typeof init.body !== 'string') return baseFetch(url, init);

    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      return baseFetch(url, init);
    }
    const formatted = pathname.endsWith('/answers')
      ? { ...body, message: formatMessageBody(body.message) }
      : formatMessageBody(body);
    return baseFetch(url, { ...init, body: JSON.stringify(formatted) });
  };
}
