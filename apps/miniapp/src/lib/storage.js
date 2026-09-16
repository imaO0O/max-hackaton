/**
 * Локальное хранилище на устройстве пользователя. Используется для оценок:
 * они не отправляются на сервер. Доступ обёрнут в try/catch — хранилище может быть недоступно.
 */

const PREFIX = 'posle9:';

export function loadLocal(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveLocal(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // нечего удалять
  }
}
