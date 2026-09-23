import { nowIso } from '../db/database.js';

export function createEventRepository(db) {
  return {
    insert(name, userId, props = {}) {
      db.prepare('INSERT INTO events (name, user_id, props, created_at) VALUES (?, ?, ?, ?)')
        .run(name, userId ?? null, JSON.stringify(props), nowIso());
    },

    /** Сколько раз произошло событие и у скольких разных пользователей. */
    count(name, since) {
      const row = db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS users
        FROM events WHERE name = ? AND created_at >= ?`).get(name, since);
      return { total: row.total, users: row.users };
    },

    /** Распределение пользователей по значению свойства события, например по источнику открытия. */
    countUsersByProp(name, prop, since) {
      return db.prepare(`SELECT json_extract(props, ?) AS value, COUNT(DISTINCT user_id) AS users
        FROM events WHERE name = ? AND created_at >= ?
        GROUP BY value ORDER BY users DESC`).all(`$.${prop}`, name, since)
        .map((row) => ({ value: row.value, users: row.users }));
    },
  };
}
