import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config.js';
import { createTestApp } from './helpers.js';

test('без BOT_TOKEN сервер запускается без бота, а не падает', () => {
  const config = loadConfig({ NODE_ENV: 'production' });
  assert.equal(config.botEnabled, false);
  assert.ok(config.warnings.some((warning) => /BOT_TOKEN не задан: бот и напоминания выключены/.test(warning)));

  assert.equal(loadConfig({ BOT_TOKEN: 'token-123' }).botEnabled, true, 'с токеном бот включён');
  assert.equal(loadConfig({ BOT_TOKEN: 'token-123', BOT_ENABLED: 'false' }).botEnabled, false);
});

test('/api/health без токена: сервис работает, бот выключен', async () => {
  const ctx = createTestApp({ config: { botToken: '', botEnabled: false } });
  const health = await ctx.app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, 'ok');
  assert.equal(health.json().bot, 'disabled');
  await ctx.app.close();
  ctx.db.close();
});

test('TRUST_PROXY: по умолчанию — локальные адреса и сеть Docker, можно переопределить', () => {
  assert.equal(loadConfig({ BOT_TOKEN: 't' }).trustProxy, 'loopback,uniquelocal');
  assert.equal(loadConfig({ BOT_TOKEN: 't', TRUST_PROXY: '10.0.0.5' }).trustProxy, '10.0.0.5');
});
