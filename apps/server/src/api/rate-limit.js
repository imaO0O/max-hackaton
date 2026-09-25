/**
 * Ограничение частоты запросов к API: фиксированное окно в минуту на IP-адрес.
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
    /** @returns {{ allowed: boolean, retryAfterSeconds: number }} */
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
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    },
  };
}
