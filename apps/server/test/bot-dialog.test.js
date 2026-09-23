import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createBot } from '../src/bot/bot.js';
import { createTestApp } from './helpers.js';

/**
 * Диалог бота без обращений к MAX: Bot API подменяется функцией fetch,
 * которая запоминает запросы и отвечает как сервер MAX.
 */

const USER = { user_id: 555, first_name: 'Родитель', name: 'Родитель', username: null, is_bot: false, last_activity_time: 0 };
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

function command(text) {
  return {
    update_type: 'message_created',
    timestamp: timestamp(),
    message: {
      sender: USER,
      recipient: { chat_id: 555, chat_type: 'dialog', user_id: 555 },
      timestamp: timestamp(),
      body: { mid: `in-${Math.random()}`, seq: 1, text },
    },
  };
}

function press(payload) {
  return {
    update_type: 'message_callback',
    timestamp: timestamp(),
    callback: { callback_id: `cb-${Math.random()}`, payload, user: USER, timestamp: timestamp() },
    message: {
      sender: { ...USER, user_id: 1, is_bot: true },
      recipient: { chat_id: 555, chat_type: 'dialog' },
      timestamp: timestamp(),
      body: { mid: 'bot-message', seq: 1, text: '' },
    },
  };
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
    assert.ok(summary.buttons.includes('plan:all'));
    assert.ok(summary.buttons.includes('reminders:toggle'));

    const profile = ctx.services.plan.getProfile(555);
    assert.deepEqual(
      { regionId: profile.regionId, city: profile.city, grade: profile.grade, path: profile.path, interests: profile.interests },
      { regionId: 'demo-standard', city: 'Демоград', grade: 9, path: 'college', interests: ['it'] },
    );
  });

  test('устаревшая кнопка опроса предлагает начать заново', async () => {
    await bot.handleUpdate(press('survey:grade:9'));
    assert.match(lastAnswer().text, /Этот вопрос устарел/);
  });

  test('неизвестный регион в кнопке не ломает опрос', async () => {
    await bot.handleUpdate(press('survey:region:nowhere'));
    assert.match(lastAnswer().text, /Этот вопрос устарел/);
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
    assert.match(lastAnswer().text, /Так будет выглядеть напоминание:\n\n⏰/);
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
