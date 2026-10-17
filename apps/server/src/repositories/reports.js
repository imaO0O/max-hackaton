import { nowIso } from '../db/database.js';

export function createReportRepository(db) {
  return {
    /** Сохраняет сообщение. false — эта семья уже сообщала о той же неточности. */
    create({
      userId, targetType, targetId, reason, createdAt = nowIso(),
    }) {
      return db.prepare(`INSERT INTO data_reports (user_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING`).run(userId, targetType, targetId, reason, createdAt).changes > 0;
    },

    /**
     * Открытые сообщения для команды проекта, сгруппированные по записи и причине: сначала самые старые.
     * Номер группы — id первого сообщения, по нему группу закрывают командой /report_done.
     */
    openGroups({ limit = 15 } = {}) {
      return db.prepare(`SELECT MIN(id) AS group_id, target_type, target_id, reason, COUNT(*) AS count,
          MIN(created_at) AS first_at, MAX(created_at) AS last_at
        FROM data_reports WHERE resolved_at IS NULL
        GROUP BY target_type, target_id, reason ORDER BY first_at LIMIT ?`).all(limit)
        .map((row) => ({
          groupId: row.group_id, targetType: row.target_type, targetId: row.target_id, reason: row.reason,
          count: row.count, firstAt: row.first_at, lastAt: row.last_at,
        }));
    },

    /** Закрыть группу: все открытые сообщения с той же записью и причиной. Возвращает число закрытых. */
    resolve(groupId, resolution, resolvedAt = nowIso()) {
      const row = db.prepare('SELECT target_type, target_id, reason FROM data_reports WHERE id = ?').get(groupId);
      if (!row) return 0;
      return db.prepare(`UPDATE data_reports SET resolved_at = ?, resolution = ?
        WHERE target_type = ? AND target_id = ? AND reason = ? AND resolved_at IS NULL`)
        .run(resolvedAt, resolution, row.target_type, row.target_id, row.reason).changes;
    },

    /** Сколько закрыто с даты since и сколько дней в среднем от сообщения до закрытия. */
    resolvedStats(since) {
      const row = db.prepare(`SELECT COUNT(*) AS count, AVG(julianday(resolved_at) - julianday(created_at)) AS avg_days
        FROM data_reports WHERE resolved_at IS NOT NULL AND resolved_at >= ?`).get(since);
      return { count: row.count, avgDays: row.avg_days };
    },

    /** Первая запись группы — чтобы показать, что именно закрыли. */
    getGroupTarget(groupId) {
      const row = db.prepare('SELECT target_type, target_id, reason FROM data_reports WHERE id = ?').get(groupId);
      return row ? { targetType: row.target_type, targetId: row.target_id, reason: row.reason } : null;
    },

    count(since) {
      return db.prepare('SELECT COUNT(*) AS count FROM data_reports WHERE created_at >= ?').get(since).count;
    },
  };
}
