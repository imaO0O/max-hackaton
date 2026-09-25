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

    /**
     * Воронка по ссылкам для школ: сколько человек пришло по каждому коду (событие входа со свойством campaign)
     * и сколько из них дошли до цели — например, собрали план.
     */
    countCampaigns({ entryEvents, goalEvent, since }) {
      const placeholders = entryEvents.map(() => '?').join(', ');
      return db.prepare(`SELECT json_extract(e.props, '$.campaign') AS campaign,
          COUNT(DISTINCT e.user_id) AS users,
          COUNT(DISTINCT goal.user_id) AS completed
        FROM events e
        LEFT JOIN events goal ON goal.user_id = e.user_id AND goal.name = ?
        WHERE e.name IN (${placeholders}) AND e.created_at >= ? AND json_extract(e.props, '$.campaign') IS NOT NULL
        GROUP BY campaign ORDER BY users DESC, campaign`).all(goalEvent, ...entryEvents, since)
        .map((row) => ({ campaign: row.campaign, users: row.users, completed: row.completed }));
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
