import { Keyboard } from '@maxhub/max-bot-api';
import { REPORT_REASONS, REPORT_TARGETS, REPORT_THANKS } from '@posle9/core';

import { EVENTS } from '../services/analytics.js';
import { texts } from './texts.js';

/**
 * «Сообщить о неточности» в чате: из карточки программы колледжа или пункта плана.
 * Payload: rp:<p|i>:<id> — выбор причины, rr:<p|i>:<причина>:<id> — сохранить.
 * Команда проекта видит сводку командой /reports (ADMIN_USER_IDS).
 */

const button = Keyboard.button;
const TYPE_BY_CODE = { p: REPORT_TARGETS.PROGRAM, i: REPORT_TARGETS.ITEM };

export function registerReportsChat({ bot, reference, services, config }) {
  const userIdOf = (ctx) => ctx.user?.user_id;
  const payloadOf = (ctx) => ctx.callback?.payload ?? '';

  /** Вернуться к карточке, из которой пришли. */
  const backRow = (code, targetId) => [button.callback('← Назад', code === 'p' ? `p:${targetId}` : `item:${targetId}`)];

  function targetTitle(code, targetId) {
    if (code === 'p') {
      const program = reference.getProgram(targetId);
      return program ? `${program.specialtyTitle} — ${program.college.name}` : null;
    }
    return reference.getKeyDate(targetId)?.title ?? null;
  }

  function show(ctx, text, rows) {
    return ctx.answerOnCallback({ message: { text, attachments: [Keyboard.inlineKeyboard(rows)] } });
  }

  bot.action(/^rp:[pi]:/, async (ctx) => {
    const [, code, ...rest] = payloadOf(ctx).split(':');
    const targetId = rest.join(':');
    const title = targetTitle(code, targetId);
    if (!title) return show(ctx, texts.itemNotFound, [[button.callback('← Меню', 'menu:show')]]);
    const rows = REPORT_REASONS[TYPE_BY_CODE[code]].map((reason) => [
      button.callback(reason.title, `rr:${code}:${reason.id}:${targetId}`),
    ]);
    rows.push(backRow(code, targetId));
    return show(ctx, `Что не так?\n\n${title}\n\nВыберите причину — команда проекта сверит факт с источником. Личные данные не передаются.`, rows);
  });

  bot.action(/^rr:[pi]:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [, code, reason, ...rest] = payloadOf(ctx).split(':');
    const targetId = rest.join(':');
    let result;
    try {
      result = services.reports.create(userId, { targetType: TYPE_BY_CODE[code], targetId, reason });
    } catch {
      return show(ctx, texts.itemNotFound, [[button.callback('← Меню', 'menu:show')]]);
    }
    if (result.created) {
      services.analytics.track(EVENTS.DATA_REPORTED, userId, { targetType: TYPE_BY_CODE[code], reason, from: 'chat' });
    }
    const text = result.created ? REPORT_THANKS : 'Вы уже сообщали об этом — спасибо, команда проекта проверит.';
    return show(ctx, text, [backRow(code, targetId), [button.callback('← Меню', 'menu:show')]]);
  });

  bot.command('reports', async (ctx) => {
    const userId = userIdOf(ctx);
    if (!config.adminUserIds.includes(userId)) {
      await ctx.reply(`Команда доступна только команде проекта. Ваш ID в MAX: ${userId}`);
      return;
    }
    await ctx.reply(services.reports.summaryText());
  });
}
