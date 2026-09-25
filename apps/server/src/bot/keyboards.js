import { Keyboard } from '@maxhub/max-bot-api';

/**
 * Клавиатуры бота. Payload callback-кнопок:
 *   menu:show, plan:show, plan:all, item:<id>, item-done:<id>, item-undo:<id>,
 *   share:show, follow:<токен>, unfollow:<токен>, reminders:toggle, reminder:example, paths:show, survey:…, data:…
 * План по ссылке: shared-all:<токен>, family:show (план семьи у того, кто на него подписан).
 * Под напоминанием: ritem:<id>, rdone:<id>, rundo:<id> — они не редактируют текст напоминания.
 */

const button = Keyboard.button;
const BACK_TO_MENU = [button.callback('← Меню', 'menu:show')];
const REMINDER_EXAMPLE = [button.callback('⏰ Пример напоминания', 'reminder:example')];

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
export function menuKeyboard({
  botUsername, remindersEnabled, withReminderExample = false, withFamilyPlan = false,
}) {
  return openAppKeyboard(botUsername, [
    [button.callback('📅 Даты плана', 'plan:show'), button.callback('⚖️ Сравнить пути', 'paths:show')],
    [button.callback('🏫 Колледжи по интересам', 'colleges:show')],
    [button.callback('📨 Отправить план подростку', 'share:show')],
    ...(withFamilyPlan ? [[button.callback('👪 План, которым поделились со мной', 'family:show')]] : []),
    [button.callback(remindersEnabled ? '🔕 Выключить напоминания' : '🔔 Включить напоминания', 'reminders:toggle')],
    ...(withReminderExample ? [REMINDER_EXAMPLE] : []),
    [button.callback('✏️ Изменить ответы', 'survey:start')],
  ]);
}

/** Меню подписчика без своего плана (обычно подростка): план семьи всегда под рукой. */
export function followerMenuKeyboard({
  botUsername, token, remindersEnabled, withReminderExample = false,
}) {
  return openAppKeyboard(botUsername, [
    [button.callback('📅 План семьи', 'plan:show'), button.callback('⚖️ Сравнить пути', 'paths:show')],
    [button.callback(remindersEnabled ? '🔕 Выключить напоминания' : '🔔 Включить напоминания', 'reminders:toggle')],
    ...(withReminderExample ? [REMINDER_EXAMPLE] : []),
    [button.callback('Собрать свой план', 'survey:start')],
  ], `plan_${token}`, 'Открыть план семьи');
}

/** Сразу после опроса: все даты, колледжи по выбранным интересам, отправка подростку и пример напоминания. */
export function summaryKeyboard(botUsername) {
  return openAppKeyboard(botUsername, [
    [button.callback('📅 Все даты', 'plan:all'), button.callback('🏫 Колледжи', 'colleges:show')],
    [button.callback('📨 Отправить план подростку', 'share:show')],
    REMINDER_EXAMPLE,
    [button.callback('☰ Меню', 'menu:show')],
  ]);
}

/** Ответ на /reminders: когда напоминания включены — можно сразу посмотреть пример. */
export function remindersKeyboard(enabled) {
  return Keyboard.inlineKeyboard([...(enabled ? [REMINDER_EXAMPLE] : []), BACK_TO_MENU]);
}

export function startKeyboard({ hasProfile, botUsername, remindersEnabled = true }) {
  if (hasProfile) return menuKeyboard({ botUsername, remindersEnabled });
  return Keyboard.inlineKeyboard([
    [button.callback('Начать', 'survey:start')],
    [button.callback('⚖️ 10 класс или колледж?', 'paths:show')],
  ]);
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

/** Под карточкой пункта: отметка, источник, назад к датам (или в меню, если пункта нет в плане). */
export function planItemKeyboard({ item, canMarkDone, back = 'plan:all' }) {
  const rows = [];
  if (canMarkDone) {
    rows.push([item.done
      ? button.callback('↩️ Снять отметку', `item-undo:${item.id}`)
      : button.callback('✅ Отметить выполненным', `item-done:${item.id}`)]);
  }
  if (item.sourceUrl) rows.push([button.link('Источник', item.sourceUrl)]);
  rows.push([back === 'plan:all' ? button.callback('← Все даты', 'plan:all') : button.callback('← Меню', 'menu:show')]);
  return Keyboard.inlineKeyboard(rows);
}

/**
 * Под напоминанием: «Сделано» снимает следующие напоминания по этому пункту.
 * Кнопки не стирают напоминание: «Подробнее» присылает карточку новым сообщением, «Сделано» меняет только кнопку.
 */
export function reminderKeyboard(botUsername, { keyDateId, canMarkDone, done = false }) {
  const rows = [[button.callback('Подробнее', `ritem:${keyDateId}`)]];
  if (canMarkDone) {
    rows.unshift([done
      ? button.callback('✅ Отмечено · снять отметку', `rundo:${keyDateId}`)
      : button.callback('✅ Сделано', `rdone:${keyDateId}`)]);
  }
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
    [button.callback('📅 Все даты', `shared-all:${token}`)],
    BACK_TO_MENU,
  ], `plan_${token}`, 'Открыть в мини-приложении');
}
