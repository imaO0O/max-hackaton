import { Keyboard } from '@maxhub/max-bot-api';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import { openAppKeyboard } from './keyboards.js';
import { pathsText } from './texts.js';

/**
 * Сравнение двух путей в чате: 10–11 класс или колледж. Тексты — из data/content.json,
 * те же, что на экране «Пути» в мини-приложении. Доступно и до опроса.
 */
export function registerPathsChat({ bot, users, services, runtime }) {
  const userIdOf = (ctx) => ctx.user?.user_id;

  function pathsView(userId) {
    const hasProfile = isProfileComplete(users.ensure(userId));
    const nextRow = hasProfile
      ? [Keyboard.button.callback('← Меню', 'menu:show')]
      : [Keyboard.button.callback('Собрать план семьи', 'survey:start')];
    return {
      text: pathsText(services.catalog.getContent()),
      keyboard: openAppKeyboard(runtime.botUsername, [nextRow], 'from_bot', 'Сравнить в мини-приложении'),
    };
  }

  async function sendPaths(ctx, { edit = false } = {}) {
    const userId = userIdOf(ctx);
    services.analytics.track(EVENTS.PATHS_VIEWED_IN_CHAT, userId);
    const view = pathsView(userId);
    return edit
      ? ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } })
      : ctx.reply(view.text, { attachments: [view.keyboard] });
  }

  bot.action('paths:show', (ctx) => sendPaths(ctx, { edit: true }));

  return { sendPaths };
}
