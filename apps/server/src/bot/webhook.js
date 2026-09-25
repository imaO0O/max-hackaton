import crypto from 'node:crypto';

/**
 * Приём событий MAX через Webhook — рекомендованный MAX способ для production (Long Polling
 * документация называет подходящим для разработки и тестирования). Включается BOT_MODE=webhook.
 * MAX присылает POST на https://<домен>/bot/webhook с заголовком X-Max-Bot-Api-Secret.
 */

export const WEBHOOK_PATH = '/bot/webhook';
const SECRET_HEADER = 'x-max-bot-api-secret';

/** Секрет подписки по умолчанию выводится из токена: не нужно хранить ещё одну переменную. */
export function webhookSecretFromToken(token) {
  return crypto.createHash('sha256').update(`posle9-webhook:${token}`).digest('hex').slice(0, 48);
}

function isSecretValid(received, expected) {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Маршрут для событий MAX. Отвечает сразу, а событие обрабатывает после ответа:
 * долгий ответ MAX считает ошибкой доставки.
 */
export function registerWebhookRoute(app, { secret, handleUpdate, logger }) {
  app.post(WEBHOOK_PATH, async (request, reply) => {
    if (!isSecretValid(request.headers[SECRET_HEADER], secret)) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Неверный секрет Webhook' });
    }
    const update = request.body;
    if (!update || typeof update !== 'object' || typeof update.update_type !== 'string') {
      return reply.code(400).send({ error: 'bad_request', message: 'Ожидается событие MAX' });
    }
    setImmediate(() => {
      handleUpdate(update).catch((error) => logger.error({ err: error, updateType: update.update_type }, 'webhook update failed'));
    });
    return { ok: true };
  });
}
