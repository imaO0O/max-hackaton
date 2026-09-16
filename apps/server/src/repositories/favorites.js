import { nowIso } from '../db/database.js';

export function createFavoriteRepository(db) {
  return {
    listProgramIds(userId) {
      return db.prepare('SELECT college_specialty_id FROM favorites WHERE user_id = ? ORDER BY created_at')
        .all(userId).map((row) => row.college_specialty_id);
    },

    add(userId, programId) {
      db.prepare(`INSERT INTO favorites (user_id, college_specialty_id, created_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id, college_specialty_id) DO NOTHING`).run(userId, programId, nowIso());
    },

    remove(userId, programId) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND college_specialty_id = ?').run(userId, programId);
    },
  };
}
