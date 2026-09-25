import { buildApp } from './api/app.js';
import { createBot } from './bot/bot.js';
import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { createReminderScheduler } from './scheduler/reminder-scheduler.js';
import { trustRussianRootCa } from './tls-ca.js';

async function main() {
  const config = loadConfig();
  const { db, repos, services, runtime } = createContainer(config);
  const app = buildApp({ config, services, runtime });
  const logger = app.log;
  for (const warning of config.warnings) logger.warn(warning);

  // Справочник дат мог измениться с прошлого запуска — пересобираем очередь напоминаний
  const resynced = services.plan.syncAllReminders();
  logger.info(resynced, 'reminders resynced on startup');

  let bot = null;
  let scheduler = null;
  if (config.botEnabled) {
    if (trustRussianRootCa() === 'unsupported' && !process.env.NODE_EXTRA_CA_CERTS) {
      logger.warn('Node.js older than 24.5: set NODE_EXTRA_CA_CERTS=apps/server/certs/russian-trusted-root-ca.pem to reach MAX Bot API');
    }
    bot = createBot({ config, repos, services, runtime, logger: logger.child({ module: 'bot' }) });
    try {
      await bot.start();
    } catch (error) {
      runtime.botStatus = 'failed';
      logger.error({ err: error }, 'bot failed to start: check BOT_TOKEN and network access to MAX Bot API');
      throw error;
    }
    scheduler = createReminderScheduler({
      repos,
      runtime,
      sendMessage: (userId, text, extra) => bot.api.sendMessageToUser(userId, text, extra),
      logger: logger.child({ module: 'reminders' }),
      intervalMs: config.reminderIntervalMs,
      resyncAll: () => services.plan.syncAllReminders(),
      analytics: services.analytics,
    });
    scheduler.start();
    bot.startHealthMonitor();
  } else {
    logger.warn('BOT_ENABLED=false: bot and reminders are disabled');
  }

  await app.listen({ host: config.host, port: config.port });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    scheduler?.stop();
    bot?.stop();
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
