import { nowIso } from '../db/database.js';

export function createReportRepository(db) {
  return {
    /** Сохраняет сообщение. false — эта семья уже сообщала о той же неточности. */
    create({
      userId, targetType, targetId, reason,
    }) {
      return db.prepare(`INSERT INTO data_reports (user_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING`).run(userId, targetType, targetId, reason, nowIso()).changes > 0;
    },

    /** Сводка для команды проекта: что и почему отмечали, сколько семей, когда последний раз. */
    summary({ since, limit = 10 }) {
      return db.prepare(`SELECT target_type, target_id, reason, COUNT(*) AS count, MAX(created_at) AS last_at
        FROM data_reports WHERE created_at >= ?
        GROUP BY target_type, target_id, reason ORDER BY count DESC, last_at DESC LIMIT ?`).all(since, limit)
        .map((row) => ({
          targetType: row.target_type, targetId: row.target_id, reason: row.reason, count: row.count, lastAt: row.last_at,
        }));
    },

    count(since) {
      return db.prepare('SELECT COUNT(*) AS count FROM data_reports WHERE created_at >= ?').get(since).count;
    },
  };
}
