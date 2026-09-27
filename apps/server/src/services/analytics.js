import { EXAM_ADVICE, PATH_TITLES } from '@posle9/core';

/**
 * Метрики пилота. Событие пишется в журнал и никогда не ломает основной сценарий:
 * ошибка записи только попадает в лог.
 */

export const EVENTS = Object.freeze({
  BOT_STARTED: 'bot_started',
  SURVEY_STARTED: 'survey_started',
  SURVEY_COMPLETED: 'survey_completed',
  PLAN_VIEWED_IN_CHAT: 'plan_viewed_in_chat',
  COLLEGES_VIEWED_IN_CHAT: 'colleges_viewed_in_chat',
  PATHS_VIEWED_IN_CHAT: 'paths_viewed_in_chat',
  FREE_TEXT: 'free_text',
  MINIAPP_OPENED: 'miniapp_opened',
  SHARED_PLAN_OPENED: 'shared_plan_opened',
  FOLLOW_STARTED: 'follow_started',
  ITEM_DONE: 'item_done',
  STEP_DONE: 'step_done',
  FAVORITE_ADDED: 'favorite_added',
  CALENDAR_DOWNLOADED: 'calendar_downloaded',
  REMINDER_SENT: 'reminder_sent',
  DATA_DELETED: 'data_deleted',
  EXAM_ADVICE: 'exam_advice',
});

/**
 * Код ссылки для школы или класса: https://max.ru/<бот>?startapp=src_<код> (или ?start=src_<код> для чата).
 * Допустимые символы — как у параметра запуска MAX: латиница, цифры, «_» и «-».
 */
export const CAMPAIGN_CODE_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CAMPAIGN_PREFIX = 'src_';

/** «src_school5_9a» → «school5_9a»; иначе null. */
export function campaignOf(startParam) {
  if (typeof startParam !== 'string' || !startParam.startsWith(CAMPAIGN_PREFIX)) return null;
  const code = startParam.slice(CAMPAIGN_PREFIX.length);
  return CAMPAIGN_CODE_RE.test(code) ? code : null;
}

/** Откуда открыто мини-приложение — по параметру запуска. */
export function launchSource(startParam) {
  if (!startParam) return 'direct';
  if (startParam.startsWith('plan_')) return 'shared_link';
  if (campaignOf(startParam)) return 'campaign';
  if (startParam === 'from_reminder') return 'reminder';
  if (startParam === 'from_bot') return 'bot';
  return 'other';
}

const SOURCE_TITLES = {
  direct: 'кнопка запуска в чате',
  bot: 'кнопка в сообщении бота',
  reminder: 'кнопка в напоминании',
  shared_link: 'ссылка на чужой план',
  campaign: 'ссылка для школы',
  other: 'другое',
};

export function createAnalytics({ repos, logger, clock = () => new Date() }) {
  const { events, reference } = repos;

  function track(name, userId, props = {}) {
    try {
      events.insert(name, userId, props);
    } catch (error) {
      logger?.warn({ err: error, event: name }, 'event not recorded');
    }
  }

  function sinceIso(days) {
    if (!days) return '1970-01-01T00:00:00.000Z';
    return new Date(clock().getTime() - days * 24 * 3600 * 1000).toISOString();
  }

  /** Воронка пилота за период: days = null — за всё время. */
  function funnel(days = null) {
    const since = sinceIso(days);
    const users = (name) => events.count(name, since).users;
    const total = (name) => events.count(name, since).total;
    return {
      botStarted: users(EVENTS.BOT_STARTED),
      surveyStarted: users(EVENTS.SURVEY_STARTED),
      surveyCompleted: users(EVENTS.SURVEY_COMPLETED),
      miniappOpened: users(EVENTS.MINIAPP_OPENED),
      planViewedInChat: users(EVENTS.PLAN_VIEWED_IN_CHAT),
      collegesViewedInChat: users(EVENTS.COLLEGES_VIEWED_IN_CHAT),
      pathsViewedInChat: users(EVENTS.PATHS_VIEWED_IN_CHAT),
      freeText: users(EVENTS.FREE_TEXT),
      freeTextNotUnderstood: events.countUsersByProp(EVENTS.FREE_TEXT, 'topic', since)
        .find((row) => row.value === 'unknown')?.users ?? 0,
      sharedPlanOpened: users(EVENTS.SHARED_PLAN_OPENED),
      followStarted: users(EVENTS.FOLLOW_STARTED),
      itemsDone: total(EVENTS.ITEM_DONE),
      stepsDone: total(EVENTS.STEP_DONE),
      favoritesAdded: total(EVENTS.FAVORITE_ADDED),
      calendarDownloaded: users(EVENTS.CALENDAR_DOWNLOADED),
      examAdvice: users(EVENTS.EXAM_ADVICE),
      examAdviceByReason: events.countUsersByProp(EVENTS.EXAM_ADVICE, 'reason', since),
      remindersSent: total(EVENTS.REMINDER_SENT),
      openedFromReminder: events.countUsersByProp(EVENTS.MINIAPP_OPENED, 'source', since)
        .find((row) => row.value === 'reminder')?.users ?? 0,
      opensBySource: events.countUsersByProp(EVENTS.MINIAPP_OPENED, 'source', since),
      completedByRegion: events.countUsersByProp(EVENTS.SURVEY_COMPLETED, 'regionId', since),
      completedByPath: events.countUsersByProp(EVENTS.SURVEY_COMPLETED, 'path', since),
      campaigns: events.countCampaigns({
        entryEvents: [EVENTS.BOT_STARTED, EVENTS.MINIAPP_OPENED], goalEvent: EVENTS.SURVEY_COMPLETED, since,
      }),
    };
  }

  const percent = (part, whole) => (whole ? ` (${Math.round((part / whole) * 100)}%)` : '');

  function formatFunnel(title, data) {
    const regions = data.completedByRegion
      .map((row) => `${reference.getRegion(row.value)?.name ?? row.value}: ${row.users}`).join(', ') || '—';
    const paths = data.completedByPath
      .map((row) => `${PATH_TITLES[row.value] ?? row.value}: ${row.users}`).join(', ') || '—';
    const sources = data.opensBySource
      .map((row) => `${SOURCE_TITLES[row.value] ?? row.value}: ${row.users}`).join(', ') || '—';
    const campaigns = data.campaigns
      .map((row) => `${row.campaign} — пришли ${row.users}, собрали план ${row.completed}`).join('; ') || '—';
    const examAdvice = data.examAdviceByReason
      .map((row) => `${EXAM_ADVICE[row.value]?.title ?? row.value}: ${row.users}`).join(', ');
    return [
      title,
      `Запустили бота: ${data.botStarted}`,
      `Начали опрос: ${data.surveyStarted}`,
      `Прошли опрос: ${data.surveyCompleted}${percent(data.surveyCompleted, data.surveyStarted)}`,
      `Смотрели план в чате: ${data.planViewedInChat}`,
      `Смотрели колледжи в чате: ${data.collegesViewedInChat}`,
      `Сравнивали пути в чате: ${data.pathsViewedInChat}`,
      `Писали боту текстом: ${data.freeText}, из них бот хотя бы раз не понял: ${data.freeTextNotUnderstood}`,
      `Открыли мини-приложение: ${data.miniappOpened}`,
      `Открыли чужой план по ссылке: ${data.sharedPlanOpened}`,
      `Подписались на напоминания по чужому плану: ${data.followStarted}`,
      `Отправлено напоминаний: ${data.remindersSent}`,
      `Вернулись из напоминания в мини-приложение: ${data.openedFromReminder}`,
      `Отмечено пунктов плана: ${data.itemsDone}`,
      `Отмечено шагов чек-листа поступления: ${data.stepsDone}`,
      `Добавлено в избранное: ${data.favoritesAdded}`,
      `Скачали календарь: ${data.calendarDownloaded}`,
      `Подсказка «2 или 4 ОГЭ»: ${data.examAdvice}${examAdvice ? ` (${examAdvice})` : ''}`,
      `Регионы: ${regions}`,
      `Путь: ${paths}`,
      `Откуда открывали мини-приложение: ${sources}`,
      `Ссылки для школ: ${campaigns}`,
    ].join('\n');
  }

  return {
    track,
    funnel,
    /** Текстовый отчёт для бота и командной строки: за всё время и за 7 дней. */
    report() {
      return [
        formatFunnel('📊 За всё время', funnel(null)),
        '',
        formatFunnel('📅 За 7 дней', funnel(7)),
        '',
        'Люди считаются по уникальным ID в MAX. Имена и оценки не хранятся.',
      ].join('\n');
    },
  };
}
