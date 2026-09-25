import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { GRADE_VALUES, PATH_VALUES } from '@posle9/core';

import { createRateLimiter } from '../api/rate-limit.js';
import { isProfileComplete } from '../repositories/users.js';
import { CAMPAIGN_CODE_RE, campaignOf, EVENTS } from '../services/analytics.js';
import {
  backToMenuRow, menuKeyboard, openAppKeyboard, remindersKeyboard, remindersStatusKeyboard, startKeyboard, summaryKeyboard,
} from './keyboards.js';
import { registerCollegesChat } from './colleges-chat.js';
import { registerPathsChat } from './paths-chat.js';
import { detectTopic } from './free-text.js';
import { richTextFetch } from './rich-text.js';
import { registerPlanChat } from './plan-chat.js';
import {
  ANY_CITY, cityStep, gradeStep, interestsStep, parseSurveyPayload, pathStep, regionStep,
} from './survey.js';
import { planText, summaryText, texts } from './texts.js';

const SHARED_PLAN_PREFIX = 'plan_';
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_FAILURES_BEFORE_ALERT = 3;

/**
 * Чат-бот: опрос семьи, кнопка открытия мини-приложения, управление напоминаниями.
 * Логика профиля и плана — в сервисах, бот отвечает только за диалог.
 */
export function createBot({ config, repos, services, runtime, logger, clientOptions }) {
  // clientOptions.fetch подменяется в тестах, чтобы проверять диалог без обращений к MAX.
  // Поверх него — оформление сообщений (жирные заголовки), если BOT_RICH_TEXT не выключен
  const baseFetch = clientOptions?.fetch ?? globalThis.fetch;
  const fetch = config.botRichText ? richTextFetch(baseFetch) : baseFetch;
  const bot = new Bot(config.botToken, { clientOptions: { ...clientOptions, fetch } });
  const { users, reference } = repos;

  const userIdOf = (ctx) => ctx.user?.user_id;

  // Защита от флуда: не больше BOT_RATE_LIMIT_PER_MINUTE событий в минуту от одного пользователя.
  // На первое лишнее — одно предупреждение, дальше — тишина до конца минуты. Регистрируется до всех обработчиков.
  if (config.botRateLimitPerMinute > 0) {
    const limiter = createRateLimiter({ max: config.botRateLimitPerMinute });
    bot.use(async (ctx, next) => {
      const userId = userIdOf(ctx);
      if (!userId) return next();
      const { allowed, firstRejected } = limiter.hit(userId);
      if (allowed) return next();
      if (!firstRejected) return undefined;
      logger.warn({ userId, updateType: ctx.updateType }, 'bot rate limit exceeded');
      if (ctx.callback) return ctx.answerOnCallback({ notification: texts.tooFast });
      return ctx.chatId ? ctx.reply(texts.tooFast) : undefined;
    });
  }

  const planChat = registerPlanChat({ bot, users, reference, services, runtime });
  const collegesChat = registerCollegesChat({ bot, users, reference, services, runtime });
  const pathsChat = registerPathsChat({ bot, users, services, runtime });

  async function showStep(ctx, step, { edit }) {
    const body = { text: step.text, attachments: [step.keyboard] };
    if (edit) {
      await ctx.answerOnCallback({ message: body });
    } else {
      await ctx.reply(step.text, { attachments: [step.keyboard] });
    }
  }

  async function sendStart(ctx, payload) {
    // Запуск бота, а по ссылке для школы — ещё и код школы: в /stats видно, сколько семей она привела
    const campaign = campaignOf(payload);
    services.analytics.track(EVENTS.BOT_STARTED, userIdOf(ctx), campaign ? { campaign } : {});
    // Ссылка https://max.ru/<бот>?start=plan_<токен> открывает чужой план прямо в чате
    if (payload?.startsWith(SHARED_PLAN_PREFIX)) {
      return planChat.openSharedPlan(ctx, payload.slice(SHARED_PLAN_PREFIX.length));
    }
    const view = planChat.menuView(userIdOf(ctx), { greeting: true });
    return ctx.reply(view.text, { attachments: [view.keyboard] });
  }

  /** Справка с клавиатурой меню — своей у родителя, подписчика и нового пользователя. */
  function sendHelp(ctx) {
    return ctx.reply(texts.help, { attachments: [planChat.menuView(userIdOf(ctx)).keyboard] });
  }

  /** Метрики пилота — только для команды проекта (ADMIN_USER_IDS). */
  async function sendStats(ctx) {
    const userId = userIdOf(ctx);
    if (!config.adminUserIds.includes(userId)) {
      await ctx.reply(`Команда доступна только команде проекта. Ваш ID в MAX: ${userId}`);
      return;
    }
    await ctx.reply(services.analytics.report());
  }

  /** Ссылка для школы или класса (только команде проекта): переходы и собранные планы по ней — в /stats. */
  async function sendCampaignLink(ctx, code) {
    const userId = userIdOf(ctx);
    if (!config.adminUserIds.includes(userId)) {
      await ctx.reply(`Команда доступна только команде проекта. Ваш ID в MAX: ${userId}`);
      return;
    }
    if (!code || !CAMPAIGN_CODE_RE.test(code)) {
      await ctx.reply(texts.linkUsage);
      return;
    }
    await ctx.reply(texts.campaignLinks(runtime.botUsername, code));
  }

  async function toggleReminders(ctx) {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const profile = services.plan.setRemindersEnabled(userId, !user.remindersEnabled);
    await ctx.reply(profile.remindersEnabled ? texts.remindersOn : texts.remindersOff, {
      attachments: [remindersKeyboard(profile.remindersEnabled)],
    });
  }

  function sendDeleteConfirm(ctx) {
    return ctx.reply(texts.deleteConfirm, {
      attachments: [Keyboard.inlineKeyboard([[
        Keyboard.button.callback('Да, удалить', 'data:delete-confirm'),
        Keyboard.button.callback('Отмена', 'data:delete-cancel'),
      ]])],
    });
  }

  function sendRemindersStatus(ctx) {
    const { remindersEnabled } = users.ensure(userIdOf(ctx));
    return ctx.reply(remindersEnabled ? texts.remindersStatusOn : texts.remindersStatusOff, {
      attachments: [remindersStatusKeyboard(remindersEnabled)],
    });
  }

  function sendGradesHint(ctx) {
    return ctx.reply(texts.gradesInApp, {
      attachments: [openAppKeyboard(runtime.botUsername, [backToMenuRow()], 'from_bot', 'Посчитать средний балл')],
    });
  }

  /** Что делать с узнанной темой свободного текста. */
  const freeTextHandlers = {
    help: sendHelp,
    delete: sendDeleteConfirm,
    reminders: sendRemindersStatus,
    share: (ctx) => planChat.sendShare(ctx),
    plan: planChat.sendPlanPreview,
    paths: (ctx) => pathsChat.sendPaths(ctx),
    colleges: (ctx) => collegesChat.sendColleges(ctx),
    grades: sendGradesHint,
    thanks: (ctx) => ctx.reply(texts.thanks, { attachments: [planChat.menuView(userIdOf(ctx)).keyboard] }),
    greeting: (ctx) => sendStart(ctx),
  };

  bot.on('bot_started', (ctx) => sendStart(ctx, ctx.startPayload));
  // «/start» и «/start plan_…» — так приходит параметр ссылки, если диалог с ботом уже открыт
  bot.command(/^start(?:\s+(\S+))?$/, (ctx) => sendStart(ctx, ctx.match?.[1]));
  bot.command('plan', planChat.sendPlanPreview);
  bot.command('share', (ctx) => planChat.sendShare(ctx));
  bot.command('menu', planChat.sendMenu);
  bot.command('colleges', (ctx) => collegesChat.sendColleges(ctx));
  bot.command('paths', (ctx) => pathsChat.sendPaths(ctx));
  bot.command('reminders', toggleReminders);
  bot.command('test_reminder', planChat.sendReminderExample);
  bot.action('reminder:example', async (ctx) => {
    await ctx.answerOnCallback({ notification: 'Пример напоминания — ниже' });
    return planChat.sendReminderExample(ctx);
  });
  bot.command('stats', sendStats);
  bot.command(/^link(?:\s+(.+))?$/, (ctx) => sendCampaignLink(ctx, ctx.match?.[1]?.trim()));
  bot.command('delete_data', sendDeleteConfirm);
  bot.command('help', sendHelp);

  bot.action(/^survey:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const parsed = parseSurveyPayload(ctx.callback?.payload);
    const user = users.ensure(userId);
    const draft = user.surveyState?.draft ?? {};
    const save = (nextDraft) => users.setSurveyState(userId, { draft: nextDraft });
    // Старая кнопка опроса: с готовым планом — меню, иначе — начать заново
    const restart = () => showStep(ctx, isProfileComplete(user)
      ? { text: texts.surveyDone, keyboard: menuKeyboard({ botUsername: runtime.botUsername, remindersEnabled: user.remindersEnabled }) }
      : { text: texts.surveyExpired, keyboard: startKeyboard({ hasProfile: false }) }, { edit: true });

    if (!parsed) return restart();
    const { action, value } = parsed;

    switch (action) {
      case 'start': {
        save({});
        services.analytics.track(EVENTS.SURVEY_STARTED, userId);
        return showStep(ctx, regionStep(reference.listRegions()), { edit: true });
      }
      case 'region': {
        const region = reference.getRegion(value);
        if (!region) return restart();
        const cities = reference.listCities(region.id);
        // Колледжей региона в справочнике нет — спрашивать город незачем
        if (cities.length === 0) {
          save({ ...draft, regionId: region.id, city: null });
          return showStep(ctx, gradeStep('region'), { edit: true });
        }
        save({ ...draft, regionId: region.id });
        return showStep(ctx, cityStep(cities), { edit: true });
      }
      case 'city': {
        if (!draft.regionId) return restart();
        const cities = reference.listCities(draft.regionId);
        const city = value === ANY_CITY ? null : cities[Number(value)];
        if (value !== ANY_CITY && !city) return restart();
        save({ ...draft, city });
        return showStep(ctx, gradeStep(), { edit: true });
      }
      case 'grade': {
        const grade = Number(value);
        if (!draft.regionId || !GRADE_VALUES.includes(grade)) return restart();
        // Интересы сохраняются, если к классу вернулись кнопкой «Назад»
        const interests = draft.interests ?? [];
        save({ ...draft, grade, interests });
        return showStep(ctx, interestsStep(reference.listInterests(), interests), { edit: true });
      }
      case 'interest': {
        if (!draft.grade) return restart();
        const interests = new Set(draft.interests ?? []);
        if (interests.has(value)) interests.delete(value);
        else interests.add(value);
        const known = reference.listInterests();
        const nextInterests = [...interests].filter((id) => known.some((interest) => interest.id === id));
        save({ ...draft, interests: nextInterests });
        return showStep(ctx, interestsStep(known, nextInterests), { edit: true });
      }
      case 'interests-done': {
        if (!draft.grade) return restart();
        return showStep(ctx, pathStep(), { edit: true });
      }
      case 'path': {
        if (!draft.grade || !PATH_VALUES.includes(value)) return restart();
        const profile = services.plan.saveProfile(userId, { ...draft, path: value });
        users.setSurveyState(userId, null);
        services.analytics.track(EVENTS.SURVEY_COMPLETED, userId, {
          regionId: profile.regionId, path: profile.path, grade: profile.grade,
        });
        const region = reference.getRegion(profile.regionId);
        const interestTitles = reference.listInterests().filter((interest) => profile.interests.includes(interest.id));
        const preview = planText(services.plan.getPlan(userId), { limit: 3 });
        const text = `${summaryText({ ...profile, region, interests: interestTitles })}\n\n${preview}`;
        return showStep(ctx, { text, keyboard: summaryKeyboard(runtime.botUsername) }, { edit: true });
      }
      case 'back': {
        // Возврат на шаг назад с сохранением уже выбранных ответов
        if (value === 'region') return showStep(ctx, regionStep(reference.listRegions()), { edit: true });
        if (!draft.regionId) return restart();
        const cities = reference.listCities(draft.regionId);
        if (value === 'city') {
          return showStep(ctx, cities.length ? cityStep(cities) : regionStep(reference.listRegions()), { edit: true });
        }
        if (value === 'grade') return showStep(ctx, gradeStep(cities.length ? 'city' : 'region'), { edit: true });
        if (value === 'interests' && draft.grade) {
          return showStep(ctx, interestsStep(reference.listInterests(), draft.interests ?? []), { edit: true });
        }
        return restart();
      }
      default:
        return restart();
    }
  });

  bot.action('data:delete-confirm', async (ctx) => {
    services.plan.deleteUserData(userIdOf(ctx));
    services.analytics.track(EVENTS.DATA_DELETED, null);
    await ctx.answerOnCallback({ message: { text: texts.deleteDone } });
  });

  bot.action('data:delete-cancel', async (ctx) => {
    await ctx.answerOnCallback({ message: { text: texts.deleteCancelled } });
  });

  bot.action('reminders:toggle', async (ctx) => {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const profile = services.plan.setRemindersEnabled(userId, !user.remindersEnabled);
    const menu = planChat.menuView(userId, { withReminderExample: profile.remindersEnabled });
    await ctx.answerOnCallback({
      message: { text: profile.remindersEnabled ? texts.remindersOn : texts.remindersOff, attachments: [menu.keyboard] },
    });
  });

  bot.on('message_created', async (ctx) => {
    if (ctx.message?.recipient?.chat_type !== 'dialog') return;
    // Текст без команды: узнаём частую тему и ведём в нужный раздел, иначе — короткая подсказка и меню
    const topic = detectTopic(ctx.message?.body?.text);
    services.analytics.track(EVENTS.FREE_TEXT, userIdOf(ctx), { topic: topic ?? 'unknown' });
    if (topic) {
      await freeTextHandlers[topic](ctx);
      return;
    }
    await ctx.reply(texts.notUnderstood, { attachments: [planChat.menuView(userIdOf(ctx)).keyboard] });
  });

  bot.catch(async (error, ctx) => {
    logger.error({ err: error, updateType: ctx?.updateType }, 'bot update failed');
    // Пользователь не должен остаться без ответа
    try {
      if (ctx?.chatId) await ctx.reply(texts.error);
    } catch (replyError) {
      logger.warn({ err: replyError }, 'failed to send error reply');
    }
  });

  let healthTimer = null;
  let consecutiveFailures = 0;

  /** Проверка связи с Bot API: если MAX недоступен несколько раз подряд, это видно в /api/health и в логах. */
  async function checkHealth() {
    try {
      await bot.api.getMyInfo();
      if (runtime.botStatus === 'unreachable') logger.info('MAX Bot API is reachable again');
      consecutiveFailures = 0;
      runtime.botStatus = 'running';
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= HEALTH_FAILURES_BEFORE_ALERT) {
        runtime.botStatus = 'unreachable';
        logger.error({ err: error, consecutiveFailures }, 'MAX Bot API is unreachable');
      } else {
        logger.warn({ err: error, consecutiveFailures }, 'MAX Bot API health check failed');
      }
    }
  }

  /** Long Polling: SDK сам снимает подписку Webhook, если она была, и переподключается при сбоях сети. */
  function startPolling() {
    runtime.botMode = 'polling';
    runtime.botStatus = 'running';
    logger.info({ botUsername: runtime.botUsername }, 'bot started (long polling)');
    bot.start().catch((error) => {
      runtime.botStatus = 'failed';
      logger.error({ err: error }, 'bot polling stopped');
    });
  }

  return {
    api: bot.api,

    /**
     * Запуск: имя бота и меню команд. В режиме polling сразу начинает получать события,
     * в режиме webhook события начнут приходить после connectWebhook() — когда сервер уже слушает порт.
     */
    async start() {
      const info = await bot.api.getMyInfo();
      bot.botInfo = info;
      runtime.botUsername = config.botUsername ?? info.username;
      await bot.api.setMyCommands([
        { name: 'start', description: 'Начать или вернуться в меню' },
        { name: 'plan', description: 'Ближайшие даты плана' },
        { name: 'share', description: 'Отправить план подростку' },
        { name: 'colleges', description: 'Колледжи по интересам' },
        { name: 'paths', description: '10 класс или колледж: сравнить' },
        { name: 'reminders', description: 'Напоминания вкл/выкл' },
        { name: 'test_reminder', description: 'Пример напоминания' },
        { name: 'delete_data', description: 'Удалить мои данные' },
        { name: 'help', description: 'Помощь' },
      ]);
      if (config.botMode !== 'webhook') startPolling();
    },

    /**
     * Подписка на Webhook: MAX будет присылать события на config.botWebhookUrl. Старые подписки снимаются.
     * Если MAX не принял адрес, бот не молчит — переходит на Long Polling.
     */
    async connectWebhook() {
      const url = config.botWebhookUrl;
      try {
        const subscriptions = await bot.api.getSubscriptions() ?? [];
        await Promise.all(subscriptions.filter((item) => item.url !== url).map((item) => bot.api.unsubscribe(item.url)));
        await bot.api.subscribe(url, config.botWebhookSecret, []);
        runtime.botMode = 'webhook';
        runtime.botStatus = 'running';
        logger.info({ botUsername: runtime.botUsername, url }, 'bot started (webhook)');
      } catch (error) {
        logger.error({ err: error, url }, 'webhook subscription failed, falling back to long polling');
        startPolling();
      }
    },

    startHealthMonitor(intervalMs = HEALTH_CHECK_INTERVAL_MS) {
      healthTimer = setInterval(() => { checkHealth(); }, intervalMs);
      healthTimer.unref?.();
    },

    checkHealth,

    /** Обработка одного обновления — для тестов диалога. */
    handleUpdate: (update) => bot.handleUpdate(update),

    /**
     * Остановка. Подписку Webhook не снимаем: при перезапуске контейнера MAX повторит доставку,
     * а новый процесс продолжит принимать события по тому же адресу.
     */
    stop() {
      clearInterval(healthTimer);
      bot.stopPolling();
      runtime.botStatus = 'stopped';
    },
  };
}
