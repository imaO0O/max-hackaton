import crypto from 'node:crypto';

/**
 * Проверка подписи стартовых данных мини-приложения MAX (WebApp.initData).
 * Алгоритм из документации платформы:
 *   secret_key = HMAC_SHA256(key = "WebAppData", message = BOT_TOKEN)
 *   hash = hex(HMAC_SHA256(key = secret_key, message = отсортированные пары key=value через \n, без hash))
 *
 * @returns {{ ok: true, user: object, startParam: string|null, authDate: number }
 *   | { ok: false, reason: string }}
 */
export function validateInitData(initData, botToken, { maxAgeSeconds = 86400, now = Date.now() } = {}) {
  if (typeof initData !== 'string' || initData.length === 0) {
    return { ok: false, reason: 'missing' };
  }
  if (!botToken) {
    return { ok: false, reason: 'no_bot_token' };
  }

  const pairs = [];
  for (const part of initData.split('&')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return { ok: false, reason: 'malformed' };
    try {
      pairs.push([part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
  }

  const hashes = pairs.filter(([key]) => key === 'hash');
  if (hashes.length !== 1) return { ok: false, reason: 'no_hash' };
  const receivedHash = hashes[0][1];

  const launchParams = pairs
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(launchParams).digest('hex');

  const received = Buffer.from(receivedHash, 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const params = Object.fromEntries(pairs);
  const authDate = Number(params.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'no_auth_date' };
  if (now / 1000 - authDate > maxAgeSeconds) return { ok: false, reason: 'expired' };

  let user;
  try {
    user = JSON.parse(params.user);
  } catch {
    return { ok: false, reason: 'no_user' };
  }
  if (!Number.isSafeInteger(user?.id)) return { ok: false, reason: 'no_user' };

  return { ok: true, user, startParam: params.start_param ?? null, authDate };
}

/** Формирует подписанную строку initData. Используется в тестах и для локальной отладки. */
export function signInitData(params, botToken) {
  const entries = Object.entries(params).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  const launchParams = [...entries]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(launchParams).digest('hex');
  return [...entries, ['hash', hash]].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
