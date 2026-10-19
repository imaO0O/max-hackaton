import { reminderKeyboard } from '../bot/keyboards.js';
import { reminderText } from '../bot/texts.js';
import { weekStepCheckMessage } from '../bot/week-step-chat.js';
import { EVENTS } from '../services/analytics.js';

/** Подсказка владельцу плана: отметка «Сделано» снимает напоминания по пункту и показывает, что шаг выполнен. */
const DONE_HINT = 'Когда сделаете — нажмите «✅ Сделано»: шаг отметится в плане, и напоминаний по нему больше не будет.';

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
  repos, sendMessage, runtime, logger, intervalMs, clock = () => new Date(), analytics = null, weekSteps = null,
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
          // «Сделано» — только владельцу плана: подросток по чужому плану отмечать пункты не может
          const canMarkDone = reminder.recipientId === reminder.ownerId;
          const text = canMarkDone ? `${reminderText(reminder)}\n\n${DONE_HINT}` : reminderText(reminder);
          await sendMessage(reminder.recipientId, text, {
            attachments: [reminderKeyboard(runtime.botUsername, { keyDateId: reminder.keyDate.id, canMarkDone })],
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
      // «Получилось?» по шагу на эту неделю
      for (const check of weekSteps?.dueChecks(now) ?? []) {
        // Шага больше нет в списке или вопрос опоздал больше чем на сутки — не спрашиваем
        if (!check.step || now.getTime() - Date.parse(check.checkAt) > STALE_AFTER_MS) {
          weekSteps.markCheckSent(check.id);
          continue;
        }
        try {
          const message = weekStepCheckMessage(check);
          await sendMessage(check.userId, message.text, { attachments: [message.keyboard] });
          weekSteps.markCheckSent(check.id);
          sent += 1;
        } catch (error) {
          failed += 1;
          if (isPermanentError(error)) weekSteps.markCheckSent(check.id);
          logger.warn({ err: error, weekStepId: check.id }, 'week step check send failed');
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
