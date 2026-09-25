import { Keyboard } from '@maxhub/max-bot-api';

/**
 * Клавиатуры бота. Payload callback-кнопок:
 *   menu:show, plan:show, plan:all, item:<id>, item-done:<id>, item-undo:<id>,
 *   share:show, follow:<токен>, unfollow:<токен>, reminders:toggle, survey:…, data:…
 */

const button = Keyboard.button;
const BACK_TO_MENU = [button.callback('← Меню', 'menu:show')];

/**
 * Клавиатура с кнопкой «Открыть план». Payload попадает в start_param мини-приложения
 * и показывает в метриках, откуда его открыли (из сообщения бота или из напоминания).
 */
export function openAppKeyboard(botUsername, extraRows = [], source = 'from_bot', title = 'Открыть план') {
  const rows = [...extraRows];
  if (botUsername) {
    rows.unshift([button.openApp(title, botUsername, undefined, source)]);
  }
  return Keyboard.inlineKeyboard(rows);
}

/** Главное меню для тех, кто уже прошёл опрос: весь сценарий доступен и без мини-приложения. */
export function menuKeyboard({ botUsername, remindersEnabled }) {
  return openAppKeyboard(botUsername, [
    [button.callback('📅 Даты плана', 'plan:show')],
    [button.callback('📨 Отправить план подростку', 'share:show')],
    [button.callback(remindersEnabled ? '🔕 Выключить напоминания' : '🔔 Включить напоминания', 'reminders:toggle')],
    [button.callback('✏️ Изменить ответы', 'survey:start')],
  ]);
}

export function startKeyboard({ hasProfile, botUsername, remindersEnabled = true }) {
  if (hasProfile) return menuKeyboard({ botUsername, remindersEnabled });
  return Keyboard.inlineKeyboard([[button.callback('Начать', 'survey:start')]]);
}

/** Под превью плана: все даты и возврат в меню. */
export function planPreviewKeyboard(botUsername) {
  return openAppKeyboard(botUsername, [
    [button.callback('Все даты года', 'plan:all')],
    BACK_TO_MENU,
  ]);
}

/** Под полным списком дат: по кнопке на каждый ближайший пункт, чтобы открыть его и отметить. */
export function planItemsKeyboard(items, labelOf) {
  return Keyboard.inlineKeyboard([
    ...items.map((item) => [button.callback(labelOf(item), `item:${item.id}`)]),
    BACK_TO_MENU,
  ]);
}

/** Под карточкой пункта: отметка, источник, назад к датам. */
export function planItemKeyboard({ item, canMarkDone }) {
  const rows = [];
  if (canMarkDone) {
    rows.push([item.done
      ? button.callback('↩️ Снять отметку', `item-undo:${item.id}`)
      : button.callback('✅ Отметить выполненным', `item-done:${item.id}`)]);
  }
  if (item.sourceUrl) rows.push([button.link('Источник', item.sourceUrl)]);
  rows.push([button.callback('← Все даты', canMarkDone ? 'plan:all' : 'menu:show')]);
  return Keyboard.inlineKeyboard(rows);
}

/** Под напоминанием: «Сделано» снимает следующие напоминания по этому пункту. */
export function reminderKeyboard(botUsername, { keyDateId, canMarkDone }) {
  const rows = [[button.callback('Подробнее', `item:${keyDateId}`)]];
  if (canMarkDone) rows.unshift([button.callback('✅ Сделано', `item-done:${keyDateId}`)]);
  return openAppKeyboard(botUsername, rows, 'from_reminder');
}

/** Диплинк MAX, который открывает экран «Отправить в MAX» с готовым текстом. */
export function shareDeepLink(text) {
  return `https://max.ru/:share?text=${encodeURIComponent(text)}`;
}

export function shareKeyboard(text) {
  return Keyboard.inlineKeyboard([
    [button.link('Отправить в MAX', shareDeepLink(text))],
    BACK_TO_MENU,
  ]);
}

/** Под чужим планом, открытым в чате по ссылке. */
export function sharedPlanKeyboard({ botUsername, token, isFollowing }) {
  return openAppKeyboard(botUsername, [
    [isFollowing
      ? button.callback('Не получать напоминания', `unfollow:${token}`)
      : button.callback('🔔 Получать напоминания', `follow:${token}`)],
  ], `plan_${token}`, 'Открыть в мини-приложении');
}
