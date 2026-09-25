/**
 * Ограничение частоты: фиксированное окно в минуту на ключ — IP-адрес для API, ID пользователя для бота.
 * Хранится в памяти процесса — этого достаточно для одного экземпляра сервера.
 */
export function createRateLimiter({ max, windowMs = 60_000, clock = () => Date.now(), maxKeys = 10_000 }) {
  const windows = new Map();

  function prune(now) {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return {
    /** firstRejected — первый отказ в окне: на него стоит ответить один раз, дальше — молча. */
    /** @returns {{ allowed: boolean, firstRejected: boolean, retryAfterSeconds: number }} */
    hit(key) {
      const now = clock();
      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        if (windows.size >= maxKeys) prune(now);
        window = { count: 0, resetAt: now + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= max,
        firstRejected: window.count === max + 1,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    },
  };
}
