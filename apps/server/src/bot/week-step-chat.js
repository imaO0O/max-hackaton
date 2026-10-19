import { Keyboard } from '@maxhub/max-bot-api';
import { WEEK_STEP_CHECK_DAYS, WEEK_STEP_RESULTS } from '@posle9/core';

import { AppError } from '../services/errors.js';
import { startKeyboard } from './keyboards.js';
import { texts } from './texts.js';

/**
 * Шаг на эту неделю в чате: вопрос после плана, выбор одного действия и через 5 дней «Получилось?».
 * Payload: wk:<шаг> — выбрать, wk:change — выбрать другой, wk:later — не сейчас,
 * wkd:<номер>:<done|no> — ответ на «Получилось?» (под вопросом бота или в /step).
 */

const button = Keyboard.button;
const MENU_ROW = [button.callback('☰ Меню', 'menu:show')];
const ANSWER_CODES = { done: WEEK_STEP_RESULTS.DONE, no: WEEK_STEP_RESULTS.NOT_YET };

const QUESTION = 'Какой шаг сделаете на этой неделе? Выберите один — через 5 дней спрошу, получилось ли.';

function questionView(options, intro = QUESTION) {
  return {
    text: intro,
    keyboard: Keyboard.inlineKeyboard([
      ...options.map((option) => [button.callback(option.button, `wk:${option.id}`)]),
      [button.callback('Не сейчас', 'wk:later')],
    ]),
  };
}

/** Вопрос «Получилось?» — его присылает планировщик через WEEK_STEP_CHECK_DAYS дней после выбора. */
export function weekStepCheckMessage({ id, step }) {
  return {
    text: `${WEEK_STEP_CHECK_DAYS} дней назад вы выбрали шаг: «${step.title}». Получилось?`,
    keyboard: Keyboard.inlineKeyboard([[
      button.callback('✅ Сделано', `wkd:${id}:done`),
      button.callback('Ещё нет', `wkd:${id}:no`),
    ]]),
  };
}

const formatDay = (iso) => {
  const [, month, day] = iso.slice(0, 10).split('-');
  return `${day}.${month}`;
};

export function registerWeekStepChat({ bot, services }) {
  const userIdOf = (ctx) => ctx.user?.user_id;
  const payloadOf = (ctx) => ctx.callback?.payload ?? '';
  const edit = (ctx, view) => ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } });
  const needSurvey = { text: texts.needSurvey, keyboard: startKeyboard({ hasProfile: false }) };

  /** Что показать по /step: текущий шаг с «Сделано» или вопрос с вариантами. */
  function stepView(userId) {
    const { options, current } = services.weekStep.view(userId);
    if (!options.length) return needSurvey;
    if (current?.status === 'chosen') {
      return {
        text: [
          `Ваш шаг на эту неделю: «${current.title}».`,
          '',
          current.hint,
          '',
          `Спрошу, получилось ли, ${formatDay(current.checkAt)}. Сделали раньше — нажмите «Сделано».`,
        ].join('\n'),
        keyboard: Keyboard.inlineKeyboard([
          [button.callback('✅ Сделано', `wkd:${current.id}:done`)],
          [button.callback('Выбрать другой шаг', 'wk:change')],
          MENU_ROW,
        ]),
      };
    }
    services.weekStep.offer(userId, { from: 'bot' });
    return questionView(options);
  }

  /** После опроса — отдельным сообщением, если семья ещё не выбирала шаг. */
  async function offerAfterSurvey(ctx) {
    const userId = userIdOf(ctx);
    const { options, current } = services.weekStep.view(userId);
    if (current || !options.length) return undefined;
    services.weekStep.offer(userId, { from: 'bot' });
    const view = questionView(options);
    return ctx.reply(view.text, { attachments: [view.keyboard] });
  }

  bot.command('step', (ctx) => {
    const view = stepView(userIdOf(ctx));
    return ctx.reply(view.text, { attachments: [view.keyboard] });
  });

  bot.action('wk:later', (ctx) => edit(ctx, {
    text: 'Хорошо. Выбрать шаг на неделю можно в любой момент — /step.',
    keyboard: Keyboard.inlineKeyboard([MENU_ROW]),
  }));

  bot.action('wk:change', (ctx) => {
    const { options } = services.weekStep.view(userIdOf(ctx));
    return edit(ctx, options.length ? questionView(options) : needSurvey);
  });

  bot.action(/^wk:(?!later$|change$)[a-z_]+$/, async (ctx) => {
    const userId = userIdOf(ctx);
    try {
      const { current } = services.weekStep.choose(userId, payloadOf(ctx).slice('wk:'.length), { from: 'bot' });
      return edit(ctx, {
        text: [
          `Записали: «${current.title}».`,
          '',
          current.hint,
          '',
          `Через ${WEEK_STEP_CHECK_DAYS} дней спрошу, получилось ли. Сделали раньше — /step.`,
        ].join('\n'),
        keyboard: Keyboard.inlineKeyboard([MENU_ROW]),
      });
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) return edit(ctx, needSurvey);
      // Устаревшая кнопка: шага больше нет среди вариантов семьи (например, поменяли путь)
      if (error instanceof AppError && error.statusCode === 400) return edit(ctx, stepView(userId));
      throw error;
    }
  });

  bot.action(/^wkd:\d+:(done|no)$/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [, id, code] = payloadOf(ctx).split(':');
    let result;
    try {
      result = services.weekStep.answer(userId, Number(id), ANSWER_CODES[code], { from: 'bot' });
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return edit(ctx, { text: 'Этот шаг больше не найден. Выбрать новый — /step.', keyboard: Keyboard.inlineKeyboard([MENU_ROW]) });
      }
      throw error;
    }
    if (!result.changed) {
      return edit(ctx, { text: `Шаг «${result.step.title}» уже отмечен.`, keyboard: Keyboard.inlineKeyboard([MENU_ROW]) });
    }
    if (ANSWER_CODES[code] === WEEK_STEP_RESULTS.DONE) {
      return edit(ctx, questionView(result.options, `Отлично, записали! 🎉 «${result.step.title}» — сделано.\n\nВыберете шаг на следующую неделю?`));
    }
    return edit(ctx, questionView(
      result.options,
      'Ничего страшного — такие дела часто занимают больше недели. Выберите шаг на эту неделю — тот же или другой:',
    ));
  });

  return { offerAfterSurvey };
}
