import {
  EXAM_ADVICE, localDateString, PATH_TITLES, QUIZ_PHASES, summarizeQuiz,
} from '@posle9/core';

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
  DATA_REPORTED: 'data_reported',
  CALENDAR_DOWNLOADED: 'calendar_downloaded',
  REMINDER_SENT: 'reminder_sent',
  DATA_DELETED: 'data_deleted',
  EXAM_ADVICE: 'exam_advice',
  QUIZ_COMPLETED: 'quiz_completed',
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
  const { events, reference, plans } = repos;

  function track(name, userId, props = {}) {
    try {
      events.insert(name, userId, props, clock().toISOString());
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
      dataReported: total(EVENTS.DATA_REPORTED),
      calendarDownloaded: users(EVENTS.CALENDAR_DOWNLOADED),
      examAdvice: users(EVENTS.EXAM_ADVICE),
      examAdviceByReason: events.countUsersByProp(EVENTS.EXAM_ADVICE, 'reason', since),
      remindersSent: total(EVENTS.REMINDER_SENT),
      openedFromReminder: events.countUsersByProp(EVENTS.MINIAPP_OPENED, 'source', since)
        .find((row) => row.value === 'reminder')?.users ?? 0,
      opensBySource: events.countUsersByProp(EVENTS.MINIAPP_OPENED, 'source', since),
      completedByRegion: events.countUsersByProp(EVENTS.SURVEY_COMPLETED, 'regionId', since),
      completedByPath: events.countUsersByProp(EVENTS.SURVEY_COMPLETED, 'path', since),
      steps: stepsOnTime(since),
      quiz: summarizeQuiz(events.list(EVENTS.QUIZ_COMPLETED, since)
        .filter((event) => event.userId !== null)
        .map((event) => ({ userId: event.userId, ...event.props }))),
      campaigns: events.countCampaigns({
        entryEvents: [EVENTS.BOT_STARTED, EVENTS.MINIAPP_OPENED], goalEvent: EVENTS.SURVEY_COMPLETED, since,
      }),
    };
  }

  /**
   * Реально выполненный шаг — отличает полезный результат от простого открытия плана.
   * Ключевой шаг (keyStep в справочнике) — заявление на ОГЭ, отмеченное до 1 марта: главный показатель для семей 9 класса.
   * «Любой шаг в срок» — пункт плана отмечен не позже его даты (окончания периода или самой даты).
   * Считаются только пункты, отмеченные и сейчас: отметку могли снять. Отметка — самоотчёт семьи.
   */
  function stepsOnTime(since) {
    const completed = events.list(EVENTS.SURVEY_COMPLETED, since).filter((event) => event.userId !== null);
    const families = new Set(completed.map((event) => event.userId));
    const ninthGrade = new Set(completed.filter((event) => event.props.grade === 9).map((event) => event.userId));
    const doneNow = new Map();
    const isDoneNow = (userId, itemId) => {
      if (!doneNow.has(userId)) {
        const plan = plans.getByUser(userId);
        doneNow.set(userId, new Set(plan ? plans.listDoneItemIds(plan.id) : []));
      }
      return doneNow.get(userId).has(itemId);
    };
    const onTime = new Set();
    const fromReminder = new Set();
    const keyStep = new Set();
    for (const event of events.list(EVENTS.ITEM_DONE, since)) {
      if (event.userId === null || !families.has(event.userId)) continue;
      const keyDate = reference.getKeyDate(event.props.itemId);
      if (!keyDate) continue;
      if (localDateString(new Date(event.createdAt), 3) > (keyDate.dateEnd ?? keyDate.dateStart)) continue;
      if (!isDoneNow(event.userId, keyDate.id)) continue;
      onTime.add(event.userId);
      if (event.props.from === 'reminder') fromReminder.add(event.userId);
      if (keyDate.keyStep && ninthGrade.has(event.userId)) keyStep.add(event.userId);
    }
    return {
      families: families.size, onTime: onTime.size, fromReminder: fromReminder.size, ninthGrade: ninthGrade.size, keyStep: keyStep.size,
    };
  }

  const percent = (part, whole) => (whole ? ` (${Math.round((part / whole) * 100)}%)` : '');

  /** Проверка понимания правил: доля верных до и после, сдвиг у ответивших оба раза, по вопросам. */
  function quizLines(quiz) {
    if (!quiz.before.people && !quiz.after.people) return ['Проверка понимания правил: пока никто не отвечал'];
    const pct = (value) => (value === null ? '—' : `${value}%`);
    const avg = (value) => (value === null ? '—' : value.toFixed(1).replace('.', ','));
    return [
      `Проверка понимания правил: до плана — ${pct(quiz.before.percent)} верных (${quiz.before.people} чел.), после — ${pct(quiz.after.percent)} (${quiz.after.people} чел.)`,
      `  ответили оба раза: ${quiz.paired.people} чел., в среднем было ${avg(quiz.paired.before)} из 3 → стало ${avg(quiz.paired.after)} из 3`,
      `  по вопросам до → после: ${quiz.byQuestion.map((row) => `${row.title} ${pct(row.before)} → ${pct(row.after)}`).join('; ')}`,
    ];
  }

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
      `Ключевой шаг — заявление на ОГЭ отмечено до 1 марта: ${data.steps.keyStep} из ${data.steps.ninthGrade} семей 9 класса${percent(data.steps.keyStep, data.steps.ninthGrade)}`,
      `Любой шаг плана в срок: ${data.steps.onTime} из ${data.steps.families} собравших план${percent(data.steps.onTime, data.steps.families)}; из них по кнопке «Сделано» в напоминании: ${data.steps.fromReminder}`,
      `Отмечено шагов чек-листа поступления: ${data.stepsDone}`,
      `Добавлено в избранное: ${data.favoritesAdded}`,
      `Сообщили о неточностях в данных: ${data.dataReported} (подробно — /reports)`,
      `Скачали календарь: ${data.calendarDownloaded}`,
      `Подсказка «2 или 4 ОГЭ»: ${data.examAdvice}${examAdvice ? ` (${examAdvice})` : ''}`,
      `Регионы: ${regions}`,
      `Путь: ${paths}`,
      `Откуда открывали мини-приложение: ${sources}`,
      `Ссылки для школ: ${campaigns}`,
      ...quizLines(data.quiz),
    ].join('\n');
  }

  return {
    track,
    funnel,
    /** Отвечал ли пользователь на вопросы «до». */
    hasQuizBefore(userId) {
      return Boolean(events.lastByUser(EVENTS.QUIZ_COMPLETED, userId, 'phase', QUIZ_PHASES.BEFORE));
    },
    /** Последняя попытка пользователя в фазе: { score, total }. */
    lastQuiz(userId, phase) {
      const props = events.lastByUser(EVENTS.QUIZ_COMPLETED, userId, 'phase', phase);
      return props ? { score: props.score, total: 3 } : null;
    },
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
