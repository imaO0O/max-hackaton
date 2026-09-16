import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { daysBetween, GRADE_VALUES, PATH_VALUES } from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import {
  ANY_CITY, cityStep, gradeStep, interestsStep, openAppKeyboard, parseSurveyPayload, pathStep, regionStep, startKeyboard,
} from './survey.js';
import { reminderText, summaryText, texts } from './texts.js';

/**
 * Чат-бот: опрос семьи, кнопка открытия мини-приложения, управление напоминаниями.
 * Логика профиля и плана — в сервисах, бот отвечает только за диалог.
 */
export function createBot({ config, repos, services, runtime, logger }) {
  const bot = new Bot(config.botToken);
  const { users, reference } = repos;

  const userIdOf = (ctx) => ctx.user?.user_id;

  async function showStep(ctx, step, { edit }) {
    const body = { text: step.text, attachments: [step.keyboard] };
    if (edit) {
      await ctx.answerOnCallback({ message: body });
    } else {
      await ctx.reply(step.text, { attachments: [step.keyboard] });
    }
  }

  async function sendStart(ctx) {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const hasProfile = isProfileComplete(user);
    await ctx.reply(hasProfile ? texts.welcomeBack : texts.welcome, {
      attachments: [startKeyboard({ hasProfile, botUsername: runtime.botUsername })],
    });
  }

  async function sendOpenApp(ctx) {
    const user = users.ensure(userIdOf(ctx));
    if (!isProfileComplete(user)) {
      await ctx.reply(texts.needSurvey, { attachments: [startKeyboard({ hasProfile: false })] });
      return;
    }
    await ctx.reply('Ваш план — в мини-приложении:', { attachments: [openAppKeyboard(runtime.botUsername)] });
  }

  async function toggleReminders(ctx) {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const profile = services.plan.setRemindersEnabled(userId, !user.remindersEnabled);
    await ctx.reply(profile.remindersEnabled ? texts.remindersOn : texts.remindersOff);
  }

  /** Пример напоминания по ближайшему пункту плана — чтобы проверить формат, не дожидаясь даты. */
  async function sendTestReminder(ctx) {
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
    await ctx.reply(`Так будет выглядеть напоминание:\n\n${example}`, { attachments: [openAppKeyboard(runtime.botUsername)] });
  }

  bot.on('bot_started', sendStart);
  bot.command('start', sendStart);
  bot.command('plan', sendOpenApp);
  bot.command('reminders', toggleReminders);
  bot.command('test_reminder', sendTestReminder);
  bot.command('help', (ctx) => ctx.reply(texts.help));

  bot.action(/^survey:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const parsed = parseSurveyPayload(ctx.callback?.payload);
    const user = users.ensure(userId);
    const draft = user.surveyState?.draft ?? {};
    const save = (nextDraft) => users.setSurveyState(userId, { draft: nextDraft });
    const restart = () => showStep(ctx, { text: texts.surveyExpired, keyboard: startKeyboard({ hasProfile: false }) }, { edit: true });

    if (!parsed) return restart();
    const { action, value } = parsed;

    switch (action) {
      case 'start': {
        save({});
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
        save({ ...draft, grade, interests: [] });
        return showStep(ctx, interestsStep(reference.listInterests(), []), { edit: true });
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
        const region = reference.getRegion(profile.regionId);
        const interestTitles = reference.listInterests().filter((interest) => profile.interests.includes(interest.id));
        const text = summaryText({ ...profile, region, interests: interestTitles });
        const keyboard = openAppKeyboard(runtime.botUsername, [
          [Keyboard.button.callback(profile.remindersEnabled ? 'Выключить напоминания' : 'Включить напоминания', 'reminders:toggle')],
          [Keyboard.button.callback('Изменить ответы', 'survey:start')],
        ]);
        return showStep(ctx, { text, keyboard }, { edit: true });
      }
      default:
        return restart();
    }
  });

  bot.action('reminders:toggle', async (ctx) => {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const profile = services.plan.setRemindersEnabled(userId, !user.remindersEnabled);
    await ctx.answerOnCallback({
      message: {
        text: profile.remindersEnabled ? texts.remindersOn : texts.remindersOff,
        attachments: [openAppKeyboard(runtime.botUsername, [
          [Keyboard.button.callback(profile.remindersEnabled ? 'Выключить напоминания' : 'Включить напоминания', 'reminders:toggle')],
        ])],
      },
    });
  });

  bot.on('message_created', async (ctx) => {
    if (ctx.message?.recipient?.chat_type !== 'dialog') return;
    await ctx.reply(texts.help, {
      attachments: [startKeyboard({ hasProfile: isProfileComplete(users.ensure(userIdOf(ctx))), botUsername: runtime.botUsername })],
    });
  });

  bot.catch((error, ctx) => {
    logger.error({ err: error, updateType: ctx?.updateType }, 'bot update failed');
  });

  return {
    api: bot.api,

    async start() {
      const info = await bot.api.getMyInfo();
      runtime.botUsername = config.botUsername ?? info.username;
      await bot.api.setMyCommands([
        { name: 'start', description: 'Собрать план' },
        { name: 'plan', description: 'Открыть план' },
        { name: 'reminders', description: 'Напоминания вкл/выкл' },
        { name: 'help', description: 'Помощь' },
      ]);
      runtime.botStatus = 'running';
      logger.info({ botUsername: runtime.botUsername }, 'bot started (long polling)');
      bot.start().catch((error) => {
        runtime.botStatus = 'failed';
        logger.error({ err: error }, 'bot polling stopped');
      });
    },

    stop() {
      bot.stopPolling();
      runtime.botStatus = 'stopped';
    },
  };
}
