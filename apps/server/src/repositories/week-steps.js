function mapWeekStep(row) {
  return row && {
    id: row.id,
    userId: row.user_id,
    stepId: row.step_id,
    chosenAt: row.chosen_at,
    checkAt: row.check_at,
    checkSentAt: row.check_sent_at,
    status: row.status,
    answeredAt: row.answered_at,
  };
}

export function createWeekStepRepository(db) {
  return {
    create({ userId, stepId, chosenAt, checkAt }) {
      const { lastInsertRowid } = db.prepare(`INSERT INTO week_steps (user_id, step_id, chosen_at, check_at)
        VALUES (?, ?, ?, ?)`).run(userId, stepId, chosenAt, checkAt);
      return this.get(Number(lastInsertRowid));
    },

    get(id) {
      return mapWeekStep(db.prepare('SELECT * FROM week_steps WHERE id = ?').get(id)) ?? null;
    },

    /** Последний выбранный шаг пользователя (в любом статусе) или null. */
    latest(userId) {
      return mapWeekStep(db.prepare('SELECT * FROM week_steps WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)) ?? null;
    },

    setStep(id, stepId) {
      db.prepare('UPDATE week_steps SET step_id = ? WHERE id = ?').run(stepId, id);
    },

    answer(id, status, answeredAt) {
      db.prepare('UPDATE week_steps SET status = ?, answered_at = ? WHERE id = ?').run(status, answeredAt, id);
    },

    /** Шаги, по которым пора спросить «Получилось?», — у пользователей с включёнными напоминаниями. */
    listDueChecks(now, limit = 50) {
      return db.prepare(`SELECT w.* FROM week_steps w
        JOIN users u ON u.max_user_id = w.user_id AND u.reminders_enabled = 1
        WHERE w.status = 'chosen' AND w.check_sent_at IS NULL AND w.check_at <= ?
        ORDER BY w.check_at LIMIT ?`).all(now.toISOString(), limit).map(mapWeekStep);
    },

    markCheckSent(id, sentAt) {
      db.prepare('UPDATE week_steps SET check_sent_at = ? WHERE id = ?').run(sentAt, id);
    },
  };
}
