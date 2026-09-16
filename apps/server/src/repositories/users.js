import { nowIso } from '../db/database.js';

function mapUser(row) {
  return row && {
    id: row.max_user_id,
    regionId: row.region_id,
    city: row.city,
    grade: row.grade,
    path: row.path,
    interests: JSON.parse(row.interests),
    remindersEnabled: row.reminders_enabled === 1,
    surveyState: row.survey_state ? JSON.parse(row.survey_state) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Профиль заполнен, если известны регион, класс и путь. */
export function isProfileComplete(user) {
  return Boolean(user?.regionId && user.grade && user.path);
}

export function createUserRepository(db) {
  return {
    /** Создаёт пользователя при первом обращении. Хранится только ID пользователя в MAX. */
    ensure(maxUserId) {
      const now = nowIso();
      db.prepare(`INSERT INTO users (max_user_id, created_at, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(max_user_id) DO NOTHING`).run(maxUserId, now, now);
      return this.get(maxUserId);
    },

    get(maxUserId) {
      return mapUser(db.prepare('SELECT * FROM users WHERE max_user_id = ?').get(maxUserId)) ?? null;
    },

    updateProfile(maxUserId, { regionId, city, grade, path, interests }) {
      db.prepare(`UPDATE users SET region_id = ?, city = ?, grade = ?, path = ?, interests = ?, updated_at = ?
        WHERE max_user_id = ?`).run(regionId, city ?? null, grade, path, JSON.stringify(interests ?? []), nowIso(), maxUserId);
      return this.get(maxUserId);
    },

    setRemindersEnabled(maxUserId, enabled) {
      db.prepare('UPDATE users SET reminders_enabled = ?, updated_at = ? WHERE max_user_id = ?')
        .run(enabled ? 1 : 0, nowIso(), maxUserId);
      return this.get(maxUserId);
    },

    setSurveyState(maxUserId, state) {
      db.prepare('UPDATE users SET survey_state = ?, updated_at = ? WHERE max_user_id = ?')
        .run(state ? JSON.stringify(state) : null, nowIso(), maxUserId);
    },
  };
}
