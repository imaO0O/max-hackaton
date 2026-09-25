import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { daysBetween, GRADE_VALUES, PATH_VALUES } from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import {
  menuKeyboard, reminderKeyboard, remindersKeyboard, startKeyboard, summaryKeyboard,
} from './keyboards.js';
import { registerCollegesChat } from './colleges-chat.js';
import { registerPathsChat } from './paths-chat.js';
import { richTextFetch } from './rich-text.js';
import { registerPlanChat } from './plan-chat.js';
import {
  ANY_CITY, cityStep, gradeStep, interestsStep, parseSurveyPayload, pathStep, regionStep,
} from './survey.js';
import { planText, reminderText, summaryText, texts } from './texts.js';

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
    // Ссылка https://max.ru/<бот>?start=plan_<токен> открывает чужой план прямо в чате
    if (payload?.startsWith(SHARED_PLAN_PREFIX)) {
      return planChat.openSharedPlan(ctx, payload.slice(SHARED_PLAN_PREFIX.length));
    }
    const user = users.ensure(userIdOf(ctx));
    const hasProfile = isProfileComplete(user);
    return ctx.reply(hasProfile ? texts.welcomeBack : texts.welcome, {
      attachments: [startKeyboard({ hasProfile, botUsername: runtime.botUsername, remindersEnabled: user.remindersEnabled })],
    });
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

  async function toggleReminders(ctx) {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const profile = services.plan.setRemindersEnabled(userId, !user.remindersEnabled);
    await ctx.reply(profile.remindersEnabled ? texts.remindersOn : texts.remindersOff, {
      attachments: [remindersKeyboard(profile.remindersEnabled)],
    });
  }

  /**
   * Пример напоминания по ближайшему пункту плана — чтобы увидеть его, не дожидаясь даты.
   * Выглядит и работает как настоящее: с кнопками «Сделано» и «Подробнее».
   */
  async function sendReminderExample(ctx) {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) {
      await ctx.reply(texts.needSurvey, { attachments: [startKeyboard({ hasProfile: false })] });
      return;
    }
    const plan = services.plan.getPlan(userId);
    const item = plan.items.find((row) => row.id === plan.nextItemId) ?? plan.items.at(-1);
    if (!item) {
      await ctx.reply('В плане пока нет дат на этот учебный год.');
      return;
    }
    const inProgress = item.status === 'current' && item.dateEnd;
    const example = reminderText({
      keyDate: item,
      anchor: inProgress ? 'end' : 'start',
      daysBefore: Math.max(0, inProgress ? daysBetween(plan.today, item.dateEnd) : (item.daysLeft ?? 0)),
    });
    await ctx.reply(`${example}\n\n${texts.reminderExampleNote}`, {
      attachments: [reminderKeyboard(runtime.botUsername, { keyDateId: item.id, canMarkDone: true, done: item.done })],
    });
  }

  bot.on('bot_started', (ctx) => sendStart(ctx, ctx.startPayload));
  // «/start» и «/start plan_…» — так приходит параметр ссылки, если диалог с ботом уже открыт
  bot.command(/^start(?:\s+(\S+))?$/, (ctx) => sendStart(ctx, ctx.match?.[1]));
  bot.command('plan', planChat.sendPlanPreview);
  bot.command('share', (ctx) => planChat.sendShare(ctx));
  bot.command('menu', planChat.sendMenu);
  bot.command('colleges', (ctx) => collegesChat.sendColleges(ctx));
  bot.command('paths', (ctx) => pathsChat.sendPaths(ctx));
  bot.command('reminders', toggleReminders);
  bot.command('test_reminder', sendReminderExample);
  bot.action('reminder:example', async (ctx) => {
    await ctx.answerOnCallback({ notification: 'Пример напоминания — ниже' });
    return sendReminderExample(ctx);
  });
  bot.command('stats', sendStats);
  bot.command('delete_data', (ctx) => ctx.reply(texts.deleteConfirm, {
    attachments: [Keyboard.inlineKeyboard([[
      Keyboard.button.callback('Да, удалить', 'data:delete-confirm'),
      Keyboard.button.callback('Отмена', 'data:delete-cancel'),
    ]])],
  }));
  bot.command('help', (ctx) => {
    const user = users.ensure(userIdOf(ctx));
    return ctx.reply(texts.help, {
      attachments: [startKeyboard({
        hasProfile: isProfileComplete(user), botUsername: runtime.botUsername, remindersEnabled: user.remindersEnabled,
      })],
    });
  });

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
        const nextDraft = { regionId: region.id };
        save(nextDraft);
        return showStep(ctx, cityStep(reference.listCities(region.id)), { edit: true });
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
        if (value === 'city') return showStep(ctx, cityStep(reference.listCities(draft.regionId)), { edit: true });
        if (value === 'grade') return showStep(ctx, gradeStep(), { edit: true });
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
    const hasProfile = isProfileComplete(users.get(userId));
    await ctx.answerOnCallback({
      message: {
        text: profile.remindersEnabled ? texts.remindersOn : texts.remindersOff,
        attachments: [hasProfile
          ? menuKeyboard({
            botUsername: runtime.botUsername,
            remindersEnabled: profile.remindersEnabled,
            withReminderExample: profile.remindersEnabled,
          })
          : startKeyboard({ hasProfile: false })],
      },
    });
  });

  bot.on('message_created', async (ctx) => {
    if (ctx.message?.recipient?.chat_type !== 'dialog') return;
    const user = users.ensure(userIdOf(ctx));
    await ctx.reply(texts.help, {
      attachments: [startKeyboard({
        hasProfile: isProfileComplete(user), botUsername: runtime.botUsername, remindersEnabled: user.remindersEnabled,
      })],
    });
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

  return {
    api: bot.api,

    async start() {
      const info = await bot.api.getMyInfo();
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
      runtime.botStatus = 'running';
      logger.info({ botUsername: runtime.botUsername }, 'bot started (long polling)');
      bot.start().catch((error) => {
        runtime.botStatus = 'failed';
        logger.error({ err: error }, 'bot polling stopped');
      });
    },

    startHealthMonitor(intervalMs = HEALTH_CHECK_INTERVAL_MS) {
      healthTimer = setInterval(() => { checkHealth(); }, intervalMs);
      healthTimer.unref?.();
    },

    checkHealth,

    /** Обработка одного обновления — для тестов диалога. */
    handleUpdate: (update) => bot.handleUpdate(update),

    stop() {
      clearInterval(healthTimer);
      bot.stopPolling();
      runtime.botStatus = 'stopped';
    },
  };
}
