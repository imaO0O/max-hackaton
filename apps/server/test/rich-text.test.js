import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBot } from '../src/bot/bot.js';
import { escapeHtml, richTextFetch, toRichHtml } from '../src/bot/rich-text.js';
import { createTestApp } from './helpers.js';

test('заголовок и подписи разделов жирные, спецсимволы экранированы', () => {
  const text = 'План на 2026/2027 · Регион\n\nБлижайшие даты:\n• 1 марта — Заявление <ОГЭ> & экзамены\n\nВыполнено: 0 из 3.';
  assert.equal(
    toRichHtml(text),
    '<b>План на 2026/2027 · Регион</b>\n\n<b>Ближайшие даты:</b>\n• 1 марта — Заявление &lt;ОГЭ&gt; &amp; экзамены\n\nВыполнено: 0 из 3.',
  );
  assert.equal(toRichHtml('Одна строка'), 'Одна строка', 'короткое сообщение не выделяется целиком');
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('fetch-обёртка оформляет /messages и /answers и не трогает остальное', async () => {
  const calls = [];
  const fetch = richTextFetch(async (url, init) => { calls.push({ url, body: init?.body ? JSON.parse(init.body) : null }); return new Response('{}'); });

  await fetch('https://api.example/messages?user_id=1', { method: 'POST', body: JSON.stringify({ text: 'Заголовок\nтекст' }) });
  assert.deepEqual(calls[0].body, { text: '<b>Заголовок</b>\nтекст', format: 'html' });

  await fetch('https://api.example/answers?callback_id=1', { method: 'POST', body: JSON.stringify({ message: { text: 'Заголовок\nтекст' } }) });
  assert.equal(calls[1].body.message.format, 'html');

  await fetch('https://api.example/messages', { method: 'POST', body: JSON.stringify({ text: '**уже**\nоформлено', format: 'markdown' }) });
  assert.equal(calls[2].body.format, 'markdown', 'явно заданный формат не меняется');

  await fetch('https://api.example/me', { method: 'GET' });
  assert.equal(calls[3].body, null);
});

test('бот с BOT_RICH_TEXT отправляет сообщения в HTML', async () => {
  const ctx = createTestApp({ config: { botRichText: true } });
  const bodies = [];
  const fakeFetch = async (url, init) => {
    bodies.push(init?.body ? JSON.parse(init.body) : null);
    return new Response(JSON.stringify({ message: { body: { mid: 'x' } } }), { status: 200 });
  };
  const bot = createBot({
    config: ctx.config, repos: ctx.repos, services: ctx.services, runtime: ctx.runtime,
    logger: { info() {}, warn() {}, error() {}, child() { return this; } },
    clientOptions: { fetch: fakeFetch },
  });
  const user = { user_id: 5, first_name: 'A', name: 'A', is_bot: false, last_activity_time: 0 };
  await bot.handleUpdate({
    update_type: 'message_created', timestamp: 1,
    message: { sender: user, recipient: { chat_id: 5, chat_type: 'dialog' }, timestamp: 1, body: { mid: 'm', seq: 1, text: '/help' } },
  });
  assert.equal(bodies.at(-1).format, 'html');
  assert.match(bodies.at(-1).text, /^<b>Что я умею:<\/b>/);
  ctx.db.close();
});
