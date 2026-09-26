import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRateLimiter } from '../src/api/rate-limit.js';
import { createTestApp } from './helpers.js';

test('окно в минуту: лимит, сброс и отдельные счётчики по ключам', () => {
  const clock = { now: 0 };
  const limiter = createRateLimiter({ max: 2, clock: () => clock.now });
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, true);
  const blocked = limiter.hit('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(limiter.hit('b').allowed, true, 'другой IP — свой счётчик');
  clock.now = 60_000;
  assert.equal(limiter.hit('a').allowed, true, 'новое окно');
});

test('API отвечает 429 с Retry-After, health не ограничивается', async () => {
  const ctx = createTestApp({ config: { rateLimitPerMinute: 3 } });
  const get = (url) => ctx.app.inject({ method: 'GET', url });
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await get('/api/regions')).statusCode, 200);
  }
  const blocked = await get('/api/regions');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.json().error.code, 'rate_limited');
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal((await get('/api/health')).statusCode, 200);
  await ctx.app.close();
  ctx.db.close();
});

test('X-Forwarded-For учитывается только от прокси: из интернета IP не подменить', async () => {
  const ctx = createTestApp({ config: { rateLimitPerMinute: 2 } });
  const get = (remoteAddress, forwardedFor) => ctx.app.inject({
    method: 'GET', url: '/api/regions', remoteAddress, headers: { 'x-forwarded-for': forwardedFor },
  });

  // Запрос напрямую с публичного адреса: подставной X-Forwarded-For не создаёт новый счётчик
  assert.equal((await get('203.0.113.7', '198.51.100.1')).statusCode, 200);
  assert.equal((await get('203.0.113.7', '198.51.100.2')).statusCode, 200);
  assert.equal((await get('203.0.113.7', '198.51.100.3')).statusCode, 429);

  // Через Caddy в сети Docker: у каждого клиента свой счётчик по X-Forwarded-For
  assert.equal((await get('172.18.0.3', '198.51.100.10')).statusCode, 200);
  assert.equal((await get('172.18.0.3', '198.51.100.11')).statusCode, 200);
  assert.equal((await get('172.18.0.3', '198.51.100.11')).statusCode, 200);
  assert.equal((await get('172.18.0.3', '198.51.100.11')).statusCode, 429);

  await ctx.app.close();
  ctx.db.close();
});
