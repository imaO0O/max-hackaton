import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBot } from '../src/bot/bot.js';
import { createTestApp } from './helpers.js';

test('флуд: сверх лимита — одно предупреждение, дальше тишина; другие пользователи не страдают', async () => {
  const ctx = createTestApp({ config: { botRateLimitPerMinute: 3 } });
  const sent = [];
  const bot = createBot({
    config: ctx.config, repos: ctx.repos, services: ctx.services, runtime: ctx.runtime,
    logger: { info() {}, warn() {}, error() {}, child() { return this; } },
    clientOptions: {
      fetch: async (url, init) => {
        sent.push({ path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ message: { body: { mid: 'x' } } }), { status: 200 });
      },
    },
  });
  const message = (userId, text) => ({
    update_type: 'message_created', timestamp: 1,
    message: {
      sender: { user_id: userId, name: 'A', first_name: 'A', is_bot: false, last_activity_time: 0 },
      recipient: { chat_id: userId, chat_type: 'dialog' }, timestamp: 1, body: { mid: `m${Math.random()}`, seq: 1, text },
    },
  });

  for (let index = 0; index < 6; index += 1) await bot.handleUpdate(message(1, '/help'));
  const texts = sent.map((request) => request.body.text);
  assert.equal(texts.filter((text) => /Что я умею/.test(text)).length, 3, 'обработаны первые три');
  assert.equal(texts.filter((text) => /Слишком много сообщений подряд/.test(text)).length, 1, 'предупреждение одно');
  assert.equal(sent.length, 4, 'остальное — без ответа');

  await bot.handleUpdate(message(2, '/help'));
  assert.match(sent.at(-1).body.text, /Что я умею/, 'у другого пользователя свой лимит');
  ctx.db.close();
});
