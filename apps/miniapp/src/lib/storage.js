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

/** Удаляет всё, что сервис сохранил на устройстве: оценки, средний балл, отметку о первом входе. */
export function clearLocal() {
  try {
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // хранилище недоступно — удалять нечего
  }
}
