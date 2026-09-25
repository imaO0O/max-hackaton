import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createBot } from '../src/bot/bot.js';
import { createTestApp } from './helpers.js';

/**
 * Диалог бота без обращений к MAX: Bot API подменяется функцией fetch,
 * которая запоминает запросы и отвечает как сервер MAX.
 */

const USER = { user_id: 555, first_name: 'Родитель', name: 'Родитель', username: null, is_bot: false, last_activity_time: 0 };
const TEEN = { ...USER, user_id: 777, first_name: 'Подросток', name: 'Подросток' };
const silentLogger = { info() {}, warn() {}, error() {}, child() { return silentLogger; } };

let ctx;
let bot;
let requests;
let failNextSend = false;

function fakeFetch(url, init) {
  const { pathname } = new URL(url);
  const body = init?.body ? JSON.parse(init.body) : null;
  requests.push({ method: init?.method ?? 'GET', path: pathname, body });
  if (failNextSend && pathname === '/messages') {
    failNextSend = false;
    return Promise.resolve(new Response(JSON.stringify({ code: 'internal', message: 'boom' }), { status: 500 }));
  }
  const data = pathname === '/messages'
    ? { message: { body: { mid: `mid-${requests.length}`, text: body?.text }, recipient: { chat_id: 555, chat_type: 'dialog' } } }
    : { success: true };
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }));
}

const timestamp = () => Date.now();

function command(text, user = USER) {
  return {
    update_type: 'message_created',
    timestamp: timestamp(),
    message: {
      sender: user,
      recipient: { chat_id: user.user_id, chat_type: 'dialog', user_id: user.user_id },
      timestamp: timestamp(),
      body: { mid: `in-${Math.random()}`, seq: 1, text },
    },
  };
}

function press(payload, user = USER, text = '') {
  return {
    update_type: 'message_callback',
    timestamp: timestamp(),
    callback: { callback_id: `cb-${Math.random()}`, payload, user, timestamp: timestamp() },
    message: {
      sender: { ...USER, user_id: 1, is_bot: true },
      recipient: { chat_id: user.user_id, chat_type: 'dialog' },
      timestamp: timestamp(),
      body: { mid: 'bot-message', seq: 1, text },
    },
  };
}

function started(payload, user = TEEN) {
  return { update_type: 'bot_started', timestamp: timestamp(), chat_id: user.user_id, user, payload };
}

/** Все кнопки сообщения как есть — чтобы проверить ссылки. */
function allButtons(message) {
  return (message.attachments ?? []).flatMap((attachment) => attachment.payload?.buttons ?? []).flat();
}

/** Последний ответ бота: текст и payload всех кнопок. */
function lastAnswer() {
  const request = [...requests].reverse().find((item) => item.path === '/messages' || item.path === '/answers');
  const message = request.path === '/answers' ? request.body.message : request.body;
  const buttons = (message.attachments ?? [])
    .flatMap((attachment) => attachment.payload?.buttons ?? [])
    .flat()
    .map((button) => (button.type === 'callback' ? button.payload : button.type));
  const openApp = (message.attachments ?? [])
    .flatMap((attachment) => attachment.payload?.buttons ?? [])
    .flat()
    .find((button) => button.type === 'open_app') ?? null;
  return { text: message.text, buttons, path: request.path, openApp };
}

before(() => {
  ctx = createTestApp({ config: { adminUserIds: [555] } });
  ctx.runtime.botUsername = 'posle9_test_bot';
  bot = createBot({
    config: ctx.config,
    repos: ctx.repos,
    services: ctx.services,
    runtime: ctx.runtime,
    logger: silentLogger,
    clientOptions: { fetch: fakeFetch },
  });
});

beforeEach(() => {
  requests = [];
});

after(() => {
  ctx.db.close();
});

describe('опрос в боте', () => {
  test('от /start до готового плана с датами в чате', async () => {
    await bot.handleUpdate(command('/start'));
    assert.match(lastAnswer().text, /помогу семье девятиклассника/);
    assert.deepEqual(lastAnswer().buttons, ['survey:start']);

    await bot.handleUpdate(press('survey:start'));
    assert.match(lastAnswer().text, /Шаг 1 из 5/);
    assert.equal(lastAnswer().path, '/answers', 'шаги опроса редактируют то же сообщение');
    assert.ok(lastAnswer().buttons.includes('survey:region:demo-standard'));

    await bot.handleUpdate(press('survey:region:demo-standard'));
    assert.match(lastAnswer().text, /Шаг 2 из 5/);
    await bot.handleUpdate(press('survey:city:0'));
    assert.match(lastAnswer().text, /Шаг 3 из 5/);
    await bot.handleUpdate(press('survey:grade:9'));
    await bot.handleUpdate(press('survey:interest:it'));
    assert.ok(lastAnswer().buttons.some((payload) => payload === 'survey:interest:it'));
    assert.match(JSON.stringify(requests.at(-1).body), /✅ IT/);
    await bot.handleUpdate(press('survey:interests-done'));
    assert.match(lastAnswer().text, /Шаг 5 из 5/);

    await bot.handleUpdate(press('survey:path:college'));
    const summary = lastAnswer();
    assert.match(summary.text, /Готово! План собран/);
    assert.match(summary.text, /Город: Демоград/);
    assert.match(summary.text, /Ближайшие даты:/);
    assert.ok(summary.buttons.includes('open_app'), 'кнопка «Открыть план»');
    assert.equal(summary.openApp.web_app, 'posle9_test_bot');
    assert.equal(summary.openApp.payload, 'from_bot', 'источник открытия для метрик');
    for (const payload of ['plan:all', 'colleges:show', 'share:show', 'reminder:example', 'menu:show']) {
      assert.ok(summary.buttons.includes(payload), payload);
    }

    const profile = ctx.services.plan.getProfile(555);
    assert.deepEqual(
      { regionId: profile.regionId, city: profile.city, grade: profile.grade, path: profile.path, interests: profile.interests },
      { regionId: 'demo-standard', city: 'Демоград', grade: 9, path: 'college', interests: ['it'] },
    );
  });

  test('устаревшая кнопка опроса: с готовым планом — меню, без плана — начать заново', async () => {
    await bot.handleUpdate(press('survey:grade:9'));
    assert.match(lastAnswer().text, /Ответы уже сохранены/);
    assert.ok(lastAnswer().buttons.includes('plan:show'));

    await bot.handleUpdate(press('survey:grade:9', { ...USER, user_id: 559 }));
    assert.match(lastAnswer().text, /Этот вопрос устарел/);
  });

  test('неизвестный регион в кнопке не ломает опрос', async () => {
    await bot.handleUpdate(press('survey:region:nowhere', { ...USER, user_id: 559 }));
    assert.match(lastAnswer().text, /Этот вопрос устарел/);
  });
});

describe('опрос: кнопка «Назад»', () => {
  test('возвращает на предыдущий шаг и сохраняет ответы', async () => {
    const other = { ...USER, user_id: 556 };
    await bot.handleUpdate(press('survey:start', other));
    await bot.handleUpdate(press('survey:region:demo-standard', other));
    assert.ok(lastAnswer().buttons.includes('survey:back:region'));
    await bot.handleUpdate(press('survey:back:region', other));
    assert.match(lastAnswer().text, /Шаг 1 из 5/);

    await bot.handleUpdate(press('survey:region:demo-standard', other));
    await bot.handleUpdate(press('survey:city:0', other));
    await bot.handleUpdate(press('survey:grade:9', other));
    await bot.handleUpdate(press('survey:interest:medicine', other));
    await bot.handleUpdate(press('survey:back:grade', other));
    assert.match(lastAnswer().text, /Шаг 3 из 5/);
    await bot.handleUpdate(press('survey:grade:9', other));
    assert.match(JSON.stringify(requests.at(-1).body), /✅ Медицина/, 'интересы не сбросились');
    await bot.handleUpdate(press('survey:interests-done', other));
    await bot.handleUpdate(press('survey:back:interests', other));
    assert.match(lastAnswer().text, /Шаг 4 из 5/);
  });
});

describe('меню, план в чате и отправка подростку', () => {
  let token;

  test('/start для вернувшегося родителя — меню со всем сценарием', async () => {
    await bot.handleUpdate(command('/start'));
    assert.match(lastAnswer().text, /С возвращением/);
    const { buttons } = lastAnswer();
    for (const payload of ['open_app', 'plan:show', 'share:show', 'reminders:toggle', 'survey:start']) {
      assert.ok(buttons.includes(payload), payload);
    }
  });

  test('пункт плана открывается и отмечается прямо в чате', async () => {
    await bot.handleUpdate(press('plan:show'));
    assert.match(lastAnswer().text, /Ближайшие даты:/);
    assert.ok(lastAnswer().buttons.includes('plan:all'));

    await bot.handleUpdate(press('plan:all'));
    assert.match(lastAnswer().text, /Нажмите на дату/);
    const itemPayload = lastAnswer().buttons.find((payload) => payload.startsWith('item:'));
    assert.ok(itemPayload, 'у ближайших дат есть кнопки');
    const itemId = itemPayload.slice('item:'.length);

    await bot.handleUpdate(press(itemPayload));
    assert.match(lastAnswer().text, /^📌 /);
    assert.ok(lastAnswer().buttons.includes(`item-done:${itemId}`));

    await bot.handleUpdate(press(`item-done:${itemId}`));
    assert.match(lastAnswer().text, /✅ Выполнено/);
    assert.ok(lastAnswer().buttons.includes(`item-undo:${itemId}`));
    const plan = ctx.services.plan.getPlan(555);
    assert.equal(plan.items.find((item) => item.id === itemId).done, true, 'отметка видна и в мини-приложении');

    await bot.handleUpdate(press(`item-undo:${itemId}`));
    assert.doesNotMatch(lastAnswer().text, /✅ Выполнено/);
  });

  test('несуществующий пункт — понятное сообщение', async () => {
    await bot.handleUpdate(press('item:no-such-item'));
    assert.match(lastAnswer().text, /Этого пункта больше нет в плане/);
  });

  test('«Отправить план подростку»: кнопка «Отправить в MAX» и сообщение для пересылки', async () => {
    await bot.handleUpdate(press('share:show'));
    const intro = requests.find((item) => item.path === '/answers').body.message;
    assert.match(intro.text, /Отправить в MAX/);
    const shareButton = allButtons(intro).find((button) => button.type === 'link');
    assert.match(shareButton.url, /^https:\/\/max\.ru\/:share\?text=/);

    const forward = requests.filter((item) => item.path === '/messages').at(-1).body;
    const match = /startapp=plan_([A-Za-z0-9_-]+)/.exec(forward.text);
    assert.ok(match, 'ссылка на мини-приложение');
    assert.match(forward.text, /https:\/\/max\.ru\/posle9_test_bot\?start=plan_/, 'запасная ссылка на план в чате');
    token = match[1];
  });

  test('подросток открывает план по ссылке в чате и подписывается на напоминания', async () => {
    await bot.handleUpdate(started(`plan_${token}`));
    assert.match(lastAnswer().text, /С вами поделились планом/);
    assert.match(lastAnswer().text, /План на 2026\/2027/);
    assert.ok(lastAnswer().buttons.includes(`follow:${token}`));
    assert.equal(lastAnswer().openApp.payload, `plan_${token}`, 'кнопка открывает этот план в мини-приложении');

    await bot.handleUpdate(press(`follow:${token}`, TEEN));
    assert.match(lastAnswer().text, /Готово! Напоминания по этому плану/);
    assert.ok(lastAnswer().buttons.includes(`unfollow:${token}`));
    assert.ok(ctx.repos.reminders.countPending(777) > 0);

    // Пункт из напоминания подросток может открыть, но отмечать — только владелец плана
    const itemId = ctx.services.plan.getPlan(555).nextItemId;
    await bot.handleUpdate(press(`item:${itemId}`, TEEN));
    assert.match(lastAnswer().text, /^📌 /);
    assert.ok(!lastAnswer().buttons.some((payload) => payload.startsWith('item-done')));

    await bot.handleUpdate(press(`unfollow:${token}`, TEEN));
    assert.match(lastAnswer().text, /выключены/);
    assert.equal(ctx.repos.reminders.countPending(777), 0);
  });

  test('ссылка работает и командой /start с параметром; чужая и своя ссылки различаются', async () => {
    await bot.handleUpdate(command(`/start plan_${token}`, TEEN));
    assert.match(lastAnswer().text, /С вами поделились планом/);

    await bot.handleUpdate(command(`/start plan_${token}`));
    assert.match(lastAnswer().text, /Это ваш план/);

    await bot.handleUpdate(started('plan_AAAAAAAAAAAAAAAAAAAAAA'));
    assert.match(lastAnswer().text, /Ссылка на план недействительна/);
  });

  test('колледжи в чате: список по интересам, карточка, избранное', async () => {
    await bot.handleUpdate(command('/colleges'));
    const list = lastAnswer();
    assert.match(list.text, /^Колледжи: Демо-регион А, Демоград/);
    assert.match(list.text, /• Информационные системы и программирование — Демо-колледж информационных технологий/);
    const programPayload = list.buttons.find((payload) => payload.startsWith('p:'));
    assert.ok(programPayload);
    assert.ok(programPayload.length <= 64, 'payload кнопки укладывается в ограничение длины');
    const programId = programPayload.slice(2);

    await bot.handleUpdate(press(programPayload));
    assert.match(lastAnswer().text, /^🏫 /);
    assert.match(lastAnswer().text, /ориентир по прошлому году/);
    assert.ok(lastAnswer().buttons.includes(`pf:${programId}`));

    await bot.handleUpdate(press(`pf:${programId}`));
    assert.match(lastAnswer().text, /★ В избранном/);
    assert.ok(ctx.services.catalog.listFavorites(555).some((program) => program.id === programId), 'избранное видно в мини-приложении');

    await bot.handleUpdate(press('colleges:show'));
    assert.ok(lastAnswer().buttons.some((payload) => payload === programPayload));
    assert.match(JSON.stringify(requests.at(-1).body), /★ /, 'избранная программа помечена в списке');

    await bot.handleUpdate(press(`pu:${programId}`));
    assert.doesNotMatch(lastAnswer().text, /★ В избранном/);
    assert.ok(!ctx.services.catalog.listFavorites(555).some((program) => program.id === programId));
  });

  test('колледжи в чате: если в городе нет программ по интересам — показываем регион', async () => {
    ctx.services.plan.saveProfile(558, { regionId: 'demo-standard', city: 'Приречный', grade: 9, path: 'college', interests: ['creative'] });
    await bot.handleUpdate(command('/colleges', { ...USER, user_id: 558 }));
    assert.match(lastAnswer().text, /В городе Приречный таких программ нет — показываю весь регион/);
    assert.match(lastAnswer().text, /Дизайн/);

    await bot.handleUpdate(press('p:no-such-program', { ...USER, user_id: 558 }));
    assert.match(lastAnswer().text, /Этой программы больше нет/);
  });

  test('/share работает и командой', async () => {
    await bot.handleUpdate(command('/share'));
    assert.match(requests.find((item) => item.path === '/messages').body.text, /Отправить в MAX/);
  });
});

describe('напоминание остаётся в чате', () => {
  test('пример напоминания: «Сделано» меняет только кнопку, «Подробнее» — новым сообщением', async () => {
    await bot.handleUpdate(press('reminder:example'));
    const example = requests.filter((item) => item.path === '/messages').at(-1).body;
    assert.match(example.text, /^⏰ /);
    assert.match(example.text, /Это пример/);
    const payloads = allButtons(example).map((button) => button.payload);
    const donePayload = payloads.find((payload) => payload?.startsWith('rdone:'));
    assert.ok(donePayload, 'кнопка «Сделано», как в настоящем напоминании');
    const itemId = donePayload.slice('rdone:'.length);
    assert.ok(payloads.includes(`ritem:${itemId}`));

    requests = [];
    await bot.handleUpdate(press(donePayload, USER, example.text));
    const answer = requests.find((item) => item.path === '/answers').body;
    assert.equal(answer.message.text, example.text, 'текст напоминания не меняется');
    assert.ok(allButtons(answer.message).some((button) => button.payload === `rundo:${itemId}`));
    assert.match(answer.notification, /Отмечено в плане/);
    assert.equal(ctx.services.plan.getPlan(555).items.find((item) => item.id === itemId).done, true);

    requests = [];
    await bot.handleUpdate(press(`ritem:${itemId}`, USER, example.text));
    assert.ok(!requests.some((item) => item.path === '/answers' && item.body.message), 'напоминание не редактируется');
    assert.match(requests.find((item) => item.path === '/messages').body.text, /^📌 /);

    await bot.handleUpdate(press(`rundo:${itemId}`, USER, example.text));
    assert.equal(ctx.services.plan.getPlan(555).items.find((item) => item.id === itemId).done, false);
  });

  test('/reminders: при включении — кнопка примера', async () => {
    await bot.handleUpdate(command('/reminders'));
    assert.match(lastAnswer().text, /Напоминания выключены/);
    assert.ok(!lastAnswer().buttons.includes('reminder:example'));
    await bot.handleUpdate(command('/reminders'));
    assert.match(lastAnswer().text, /Напоминания включены/);
    assert.ok(lastAnswer().buttons.includes('reminder:example'));
  });
});

describe('команды', () => {
  test('/plan присылает ближайшие даты, «Все даты года» — весь план', async () => {
    await bot.handleUpdate(command('/plan'));
    assert.match(lastAnswer().text, /^План на 2026\/2027 · Демо-регион А · Колледж/);
    assert.match(lastAnswer().text, /Ближайшие даты:/);

    await bot.handleUpdate(press('plan:all'));
    assert.match(lastAnswer().text, /Даты года:/);
  });

  test('/reminders переключает напоминания', async () => {
    await bot.handleUpdate(command('/reminders'));
    assert.match(lastAnswer().text, /Напоминания выключены/);
    await bot.handleUpdate(command('/reminders'));
    assert.match(lastAnswer().text, /Напоминания включены/);
  });

  test('/test_reminder показывает пример напоминания', async () => {
    await bot.handleUpdate(command('/test_reminder'));
    assert.match(lastAnswer().text, /^⏰ /);
    assert.match(lastAnswer().text, /Это пример/);
  });

  test('/stats доступна только команде проекта', async () => {
    await bot.handleUpdate(command('/stats'));
    assert.match(lastAnswer().text, /За всё время/);
    assert.match(lastAnswer().text, /Прошли опрос: 1/);

    ctx.config.adminUserIds = [];
    await bot.handleUpdate(command('/stats'));
    assert.equal(lastAnswer().text, 'Команда доступна только команде проекта. Ваш ID в MAX: 555');
    ctx.config.adminUserIds = [555];
  });

  test('обычный текст — справка', async () => {
    await bot.handleUpdate(command('привет'));
    assert.match(lastAnswer().text, /Что я умею/);
  });

  test('при ошибке бот отвечает пользователю, а не молчит', async () => {
    failNextSend = true;
    await bot.handleUpdate(command('/plan'));
    assert.match(lastAnswer().text, /Что-то пошло не так/);
  });

  test('/delete_data: отмена и удаление с подтверждением', async () => {
    await bot.handleUpdate(command('/delete_data'));
    assert.match(lastAnswer().text, /Удалить все ваши данные/);
    assert.deepEqual(lastAnswer().buttons, ['data:delete-confirm', 'data:delete-cancel']);

    await bot.handleUpdate(press('data:delete-cancel'));
    assert.match(lastAnswer().text, /Удаление отменено/);
    assert.equal(ctx.services.plan.getProfile(555).isComplete, true);

    await bot.handleUpdate(press('data:delete-confirm'));
    assert.match(lastAnswer().text, /Данные удалены/);
    assert.equal(ctx.services.plan.getProfile(555).isComplete, false);
  });
});
