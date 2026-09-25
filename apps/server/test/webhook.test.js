import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from '../src/api/app.js';
import { createBot } from '../src/bot/bot.js';
import { WEBHOOK_PATH, registerWebhookRoute, webhookSecretFromToken } from '../src/bot/webhook.js';
import { loadConfig } from '../src/config.js';
import { createTestApp } from './helpers.js';

const silentLogger = { info() {}, warn() {}, error() {}, child() { return silentLogger; } };

test('BOT_MODE: webhook с HTTPS-адресом из DOMAIN, без адреса — polling с предупреждением', () => {
  const base = { BOT_TOKEN: 'token-123', NODE_ENV: 'production' };
  const webhook = loadConfig({ ...base, BOT_MODE: 'webhook', DOMAIN: 'example.ru' });
  assert.equal(webhook.botMode, 'webhook');
  assert.equal(webhook.botWebhookUrl, 'https://example.ru/bot/webhook');
  assert.equal(webhook.botWebhookSecret, webhookSecretFromToken('token-123'));
  assert.match(webhook.botWebhookSecret, /^[a-f0-9]{48}$/);

  const explicit = loadConfig({ ...base, BOT_MODE: 'webhook', BOT_WEBHOOK_URL: 'https://bot.example.ru/', BOT_WEBHOOK_SECRET: 'my_secret-1' });
  assert.equal(explicit.botWebhookUrl, 'https://bot.example.ru/bot/webhook');
  assert.equal(explicit.botWebhookSecret, 'my_secret-1');

  const noUrl = loadConfig({ ...base, BOT_MODE: 'webhook' });
  assert.equal(noUrl.botMode, 'polling');
  assert.ok(noUrl.warnings.some((warning) => /BOT_MODE=webhook/.test(warning)));

  assert.equal(loadConfig(base).botMode, 'polling', 'по умолчанию — polling');
  assert.throws(() => loadConfig({ ...base, BOT_MODE: 'push' }), /BOT_MODE/);
  assert.throws(() => loadConfig({ ...base, BOT_WEBHOOK_SECRET: 'bad secret' }), /BOT_WEBHOOK_SECRET/);
});

test('маршрут Webhook: принимает только события с верным секретом и отвечает сразу', async () => {
  const ctx = createTestApp();
  const app = buildApp({ config: ctx.config, services: ctx.services, runtime: ctx.runtime, logger: false });
  const received = [];
  registerWebhookRoute(app, { secret: 'secret-123', handleUpdate: async (update) => { received.push(update); }, logger: silentLogger });
  await app.ready();
  const post = (headers, payload) => app.inject({ method: 'POST', url: WEBHOOK_PATH, headers, payload });

  const wrong = await post({ 'x-max-bot-api-secret': 'nope' }, { update_type: 'message_created' });
  assert.equal(wrong.statusCode, 401);
  const missing = await post({}, { update_type: 'message_created' });
  assert.equal(missing.statusCode, 401);
  const invalid = await post({ 'x-max-bot-api-secret': 'secret-123' }, { hello: 'world' });
  assert.equal(invalid.statusCode, 400);

  const ok = await post({ 'x-max-bot-api-secret': 'secret-123' }, { update_type: 'bot_started', user: { user_id: 1 } });
  assert.equal(ok.statusCode, 200);
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(received.map((update) => update.update_type), ['bot_started']);
  await app.close();
  ctx.db.close();
});

function botWithFakeMax(ctx, { failSubscribe = false } = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? 'GET';
    requests.push({ method, path: pathname, query: Object.fromEntries(searchParams), body: init.body ? JSON.parse(init.body) : null });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (pathname === '/me') return json({ user_id: 1, username: 'posle9_test_bot', name: 'Бот', is_bot: true });
    if (pathname === '/subscriptions' && method === 'GET') return json({ subscriptions: [{ url: 'https://old.example.ru/hook', time: 1 }] });
    if (pathname === '/subscriptions' && method === 'POST' && failSubscribe) return json({ code: 'bad', message: 'url rejected' }, 400);
    if (pathname === '/updates') {
      // Long Polling: ждём, пока бота остановят
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return json({ success: true });
  };
  const bot = createBot({ config: ctx.config, repos: ctx.repos, services: ctx.services, runtime: ctx.runtime, logger: silentLogger, clientOptions: { fetch } });
  return { bot, requests };
}

test('connectWebhook: подписка на адрес сервера, старые подписки снимаются', async () => {
  const ctx = createTestApp({ config: { botMode: 'webhook', botWebhookUrl: 'https://example.ru/bot/webhook', botWebhookSecret: 'secret-123' } });
  const { bot, requests } = botWithFakeMax(ctx);
  await bot.start();
  assert.ok(!requests.some((request) => request.path === '/updates'), 'в режиме webhook Long Polling не запускается');
  await bot.connectWebhook();

  const unsubscribe = requests.find((request) => request.method === 'DELETE' && request.path === '/subscriptions');
  assert.equal(unsubscribe.query.url, 'https://old.example.ru/hook');
  const subscribe = requests.find((request) => request.method === 'POST' && request.path === '/subscriptions');
  assert.deepEqual({ url: subscribe.body.url, secret: subscribe.body.secret }, { url: 'https://example.ru/bot/webhook', secret: 'secret-123' });
  assert.equal(ctx.runtime.botMode, 'webhook');
  assert.equal(ctx.runtime.botStatus, 'running');
  bot.stop();
  ctx.db.close();
});

test('connectWebhook: если MAX не принял адрес — бот переходит на Long Polling', async () => {
  const ctx = createTestApp({ config: { botMode: 'webhook', botWebhookUrl: 'https://example.ru/bot/webhook', botWebhookSecret: 'secret-123' } });
  const { bot, requests } = botWithFakeMax(ctx, { failSubscribe: true });
  await bot.start();
  await bot.connectWebhook();
  assert.equal(ctx.runtime.botMode, 'polling');
  assert.equal(ctx.runtime.botStatus, 'running');
  await new Promise((resolve) => { setTimeout(resolve, 20); });
  assert.ok(requests.some((request) => request.path === '/updates'), 'бот получает события через Long Polling');
  bot.stop();
  ctx.db.close();
});
