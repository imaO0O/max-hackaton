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
