import { nowIso } from '../db/database.js';

function mapPlan(row) {
  return row && { id: row.id, userId: row.user_id, shareToken: row.share_token };
}

export function createPlanRepository(db) {
  return {
    getOrCreate(userId) {
      const now = nowIso();
      db.prepare(`INSERT INTO plans (user_id, created_at, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING`).run(userId, now, now);
      return mapPlan(db.prepare('SELECT * FROM plans WHERE user_id = ?').get(userId));
    },

    getByUser(userId) {
      return mapPlan(db.prepare('SELECT * FROM plans WHERE user_id = ?').get(userId)) ?? null;
    },

    getByShareToken(token) {
      return mapPlan(db.prepare('SELECT * FROM plans WHERE share_token = ?').get(token)) ?? null;
    },

    setShareToken(planId, token) {
      db.prepare('UPDATE plans SET share_token = ?, updated_at = ? WHERE id = ?').run(token, nowIso(), planId);
    },

    listDoneItemIds(planId) {
      return db.prepare('SELECT key_date_id FROM plan_item_states WHERE plan_id = ? AND done = 1').all(planId)
        .map((row) => row.key_date_id);
    },

    setItemDone(planId, keyDateId, done) {
      db.prepare(`INSERT INTO plan_item_states (plan_id, key_date_id, done, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(plan_id, key_date_id) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at`)
        .run(planId, keyDateId, done ? 1 : 0, nowIso());
    },

    addFollower(planId, userId) {
      db.prepare(`INSERT INTO plan_followers (plan_id, user_id, created_at) VALUES (?, ?, ?)
        ON CONFLICT(plan_id, user_id) DO NOTHING`).run(planId, userId, nowIso());
    },

    removeFollower(planId, userId) {
      db.prepare('DELETE FROM plan_followers WHERE plan_id = ? AND user_id = ?').run(planId, userId);
    },

    isFollower(planId, userId) {
      return Boolean(db.prepare('SELECT 1 FROM plan_followers WHERE plan_id = ? AND user_id = ?').get(planId, userId));
    },

    /** Отзывает ссылку: старый токен перестаёт работать, подписчики отключаются вместе с их напоминаниями. */
    revokeShare(planId) {
      const followers = db.prepare('SELECT COUNT(*) AS count FROM plan_followers WHERE plan_id = ?').get(planId).count;
      db.prepare('UPDATE plans SET share_token = NULL, updated_at = ? WHERE id = ?').run(nowIso(), planId);
      db.prepare(`DELETE FROM reminders WHERE plan_id = ? AND status = 'pending'
        AND user_id IN (SELECT user_id FROM plan_followers WHERE plan_id = ?)`).run(planId, planId);
      db.prepare('DELETE FROM plan_followers WHERE plan_id = ?').run(planId);
      return followers;
    },

    /** Планы, на которые подписан пользователь (например, подросток на план родителя), — сначала новые. */
    listFollowedByUser(userId) {
      return db.prepare(`SELECT p.* FROM plan_followers f JOIN plans p ON p.id = f.plan_id
        WHERE f.user_id = ? AND p.share_token IS NOT NULL ORDER BY f.created_at DESC, f.plan_id DESC`).all(userId).map(mapPlan);
    },

    listFollowerIds(planId) {
      return db.prepare('SELECT user_id FROM plan_followers WHERE plan_id = ?').all(planId).map((row) => row.user_id);
    },

    /** Владельцы планов с заполненным профилем — для массовой пересборки напоминаний. */
    listOwnerIdsWithCompleteProfile() {
      return db.prepare(`SELECT p.user_id FROM plans p
        JOIN users u ON u.max_user_id = p.user_id
        WHERE u.region_id IS NOT NULL AND u.grade IS NOT NULL AND u.path IS NOT NULL`).all()
        .map((row) => row.user_id);
    },

    countFollowers(planId) {
      return db.prepare('SELECT COUNT(*) AS count FROM plan_followers WHERE plan_id = ?').get(planId).count;
    },
  };
}
