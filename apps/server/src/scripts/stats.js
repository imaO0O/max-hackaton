// Метрики пилота в командной строке: npm run stats
// На сервере: docker compose exec app node --disable-warning=ExperimentalWarning apps/server/src/scripts/stats.js
// Только читает базу: справочники не перезагружаются, бот не запускается.
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/database.js';
import { createEventRepository } from '../repositories/events.js';
import { createReferenceRepository } from '../repositories/reference.js';
import { createAnalytics } from '../services/analytics.js';

const config = loadConfig({ ...process.env, BOT_ENABLED: 'false' });
const db = openDatabase(config.databasePath);
try {
  const analytics = createAnalytics({
    repos: { events: createEventRepository(db), reference: createReferenceRepository(db) },
  });
  console.log(analytics.report());
} finally {
  db.close();
}
