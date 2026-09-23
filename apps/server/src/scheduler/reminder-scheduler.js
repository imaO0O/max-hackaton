import { openAppKeyboard } from '../bot/survey.js';
import { reminderText } from '../bot/texts.js';
import { EVENTS } from '../services/analytics.js';

/** Напоминание, которое опоздало больше чем на сутки (например, сервер был выключен), не отправляется. */
const STALE_AFTER_MS = 24 * 3600 * 1000;

/** Ошибки Bot API, после которых повторять отправку бессмысленно (пользователь заблокировал бота и т. п.). */
function isPermanentError(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return status === 403 || status === 404;
}

/**
 * Планировщик: периодически отправляет наступившие напоминания через бота.
 * Работает в одном процессе с ботом; при нескольких экземплярах нужна блокировка задач.
 */
export function createReminderScheduler({
  repos, sendMessage, runtime, logger, intervalMs, clock = () => new Date(), analytics = null,
  resyncAll = null, resyncIntervalMs = 24 * 3600 * 1000,
}) {
  let timer = null;
  let resyncTimer = null;
  let running = false;

  async function tick() {
    if (running) return { skipped: true };
    running = true;
    let sent = 0;
    let failed = 0;
    try {
      const now = clock();
      for (const reminder of repos.reminders.listDue(now)) {
        const sendAt = Date.parse(reminder.sendAt);
        if (now.getTime() - sendAt > STALE_AFTER_MS) {
          repos.reminders.markFailed(reminder.id, 'stale', { permanent: true });
          continue;
        }
        try {
          await sendMessage(reminder.recipientId, reminderText(reminder), {
            attachments: [openAppKeyboard(runtime.botUsername, [], 'from_reminder')],
          });
          repos.reminders.markSent(reminder.id);
          analytics?.track(EVENTS.REMINDER_SENT, reminder.recipientId, { keyDateId: reminder.keyDate.id });
          sent += 1;
        } catch (error) {
          failed += 1;
          repos.reminders.markFailed(reminder.id, error?.message ?? error, { permanent: isPermanentError(error) });
          logger.warn({ err: error, reminderId: reminder.id }, 'reminder send failed');
        }
      }
    } finally {
      running = false;
    }
    if (sent || failed) logger.info({ sent, failed }, 'reminders processed');
    return { sent, failed };
  }

  return {
    tick,
    start() {
      timer = setInterval(() => {
        tick().catch((error) => logger.error({ err: error }, 'reminder tick failed'));
      }, intervalMs);
      timer.unref?.();
      if (resyncAll) {
        // Раз в сутки: подхватить смену учебного года и изменённые даты
        resyncTimer = setInterval(() => {
          try {
            const result = resyncAll();
            logger.info(result, 'reminders resynced');
          } catch (error) {
            logger.error({ err: error }, 'reminders resync failed');
          }
        }, resyncIntervalMs);
        resyncTimer.unref?.();
      }
    },
    stop() {
      clearInterval(timer);
      clearInterval(resyncTimer);
      timer = null;
      resyncTimer = null;
    },
  };
}
