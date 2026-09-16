import { transaction, nowIso } from '../db/database.js';
import { mapKeyDate } from './reference.js';

export const MAX_REMINDER_ATTEMPTS = 3;

export function createReminderRepository(db) {
  return {
    /** Заменяет ожидающие напоминания получателя по плану новым расписанием. Отправленные не трогает. */
    replacePending({ userId, planId, schedule }) {
      transaction(db, () => {
        db.prepare("DELETE FROM reminders WHERE user_id = ? AND plan_id = ? AND status = 'pending'").run(userId, planId);
        const insert = db.prepare(`INSERT INTO reminders (user_id, plan_id, key_date_id, anchor, days_before, send_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, plan_id, key_date_id, anchor, days_before) DO NOTHING`);
        for (const entry of schedule) {
          insert.run(userId, planId, entry.keyDateId, entry.anchor, entry.daysBefore, entry.sendAt);
        }
      });
    },

    deletePending({ userId, planId }) {
      db.prepare("DELETE FROM reminders WHERE user_id = ? AND plan_id = ? AND status = 'pending'").run(userId, planId);
    },

    countPending(userId) {
      return db.prepare("SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND status = 'pending'").get(userId).count;
    },

    /** Напоминания, время которых пришло, для пользователей с включёнными напоминаниями. */
    listDue(now = new Date(), limit = 50) {
      const rows = db.prepare(`
        SELECT r.id AS reminder_id, r.user_id AS recipient_id, r.plan_id, r.anchor, r.days_before, r.attempts, r.send_at AS reminder_send_at,
          p.user_id AS owner_id, reg.utc_offset_hours, kd.*
        FROM reminders r
        JOIN users u ON u.max_user_id = r.user_id AND u.reminders_enabled = 1
        JOIN plans p ON p.id = r.plan_id
        JOIN users owner ON owner.max_user_id = p.user_id
        LEFT JOIN regions reg ON reg.id = owner.region_id
        JOIN key_dates kd ON kd.id = r.key_date_id
        WHERE r.status = 'pending' AND r.send_at <= ?
        ORDER BY r.send_at
        LIMIT ?`).all(now.toISOString(), limit);

      return rows.map((row) => ({
        id: row.reminder_id,
        recipientId: row.recipient_id,
        ownerId: row.owner_id,
        planId: row.plan_id,
        anchor: row.anchor,
        daysBefore: row.days_before,
        attempts: row.attempts,
        sendAt: row.reminder_send_at,
        utcOffsetHours: row.utc_offset_hours ?? 3,
        keyDate: mapKeyDate(row),
      }));
    },

    markSent(id) {
      db.prepare("UPDATE reminders SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?").run(nowIso(), id);
    },

    markFailed(id, error, { permanent = false } = {}) {
      db.prepare(`UPDATE reminders SET attempts = attempts + 1, last_error = ?,
        status = CASE WHEN ? OR attempts + 1 >= ? THEN 'failed' ELSE 'pending' END
        WHERE id = ?`).run(String(error).slice(0, 500), permanent ? 1 : 0, MAX_REMINDER_ATTEMPTS, id);
    },
  };
}
