import { openDatabase } from './db/database.js';
import { applyReferenceData, loadReferenceData } from './db/reference-data.js';
import { createEventRepository } from './repositories/events.js';
import { createFavoriteRepository } from './repositories/favorites.js';
import { createPlanRepository } from './repositories/plans.js';
import { createReferenceRepository } from './repositories/reference.js';
import { createReminderRepository } from './repositories/reminders.js';
import { createReportRepository } from './repositories/reports.js';
import { createUserRepository } from './repositories/users.js';
import { createAnalytics } from './services/analytics.js';
import { calendarSecret, createCalendarLinks, createCalendarService } from './services/calendar.js';
import { createCatalogService } from './services/catalog-service.js';
import { createPlanService } from './services/plan-service.js';
import { createReportService } from './services/reports-service.js';

/**
 * Собирает зависимости приложения: база, справочники, репозитории и сервисы.
 * Бот и HTTP-сервер подключаются поверх контейнера в index.js.
 */
export function createContainer(config, { clock } = {}) {
  const db = openDatabase(config.databasePath);
  const referenceData = loadReferenceData(config.dataDir);
  applyReferenceData(db, referenceData);

  const runtime = {
    botUsername: config.botUsername,
    botStatus: config.botEnabled ? 'starting' : 'disabled',
  };

  const repos = {
    reference: createReferenceRepository(db),
    users: createUserRepository(db),
    plans: createPlanRepository(db),
    favorites: createFavoriteRepository(db),
    reminders: createReminderRepository(db),
    events: createEventRepository(db),
    reports: createReportRepository(db),
  };

  const plan = createPlanService({ db, repos, config, runtime, clock });
  const services = {
    catalog: createCatalogService({ repos, content: referenceData.content }),
    plan,
    calendar: createCalendarService({
      plan,
      links: createCalendarLinks({ secret: calendarSecret(config.botToken), clock }),
    }),
    analytics: createAnalytics({ repos, clock }),
    reports: createReportService({ repos, clock }),
  };

  return { db, repos, services, runtime };
}
