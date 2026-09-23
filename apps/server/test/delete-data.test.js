import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { authHeaders, createTestApp } from './helpers.js';

let ctx;
const PARENT = 6001;
const TEEN = 6002;

before(async () => {
  ctx = createTestApp();
  await ctx.app.ready();
});

after(async () => {
  await ctx.app.close();
  ctx.db.close();
});

const call = (method, url, user, body) => ctx.app.inject({ method, url, headers: user ? authHeaders(user) : {}, payload: body });
const count = (sql, ...params) => ctx.db.prepare(sql).get(...params).count;

async function setupFamily() {
  await call('PUT', '/api/profile', PARENT, { regionId: 'demo-standard', grade: 9, path: 'college', interests: ['it'] });
  const college = (await call('GET', '/api/colleges?regionId=demo-standard&interests=it')).json().colleges[0];
  await call('PUT', `/api/favorites/${college.programs[0].id}`, PARENT);
  await call('PUT', '/api/plan/items/2627-rec-talk-interests', PARENT, { done: true });
  await call('GET', '/api/session', PARENT);
  const { token } = (await call('POST', '/api/plan/share', PARENT)).json();
  await call('PUT', `/api/shared-plans/${token}/follow`, TEEN, { follow: true });
  return token;
}

test('отзыв ссылки: старая ссылка не открывается, подписчик отключён, новая ссылка другая', async () => {
  const token = await setupFamily();
  assert.ok(count('SELECT COUNT(*) AS count FROM reminders WHERE user_id = ?', TEEN) > 0);

  const revoked = await call('DELETE', '/api/plan/share', PARENT);
  assert.deepEqual(revoked.json(), { revoked: true, followersRemoved: 1 });
  assert.equal((await call('GET', `/api/shared-plans/${token}`, TEEN)).statusCode, 404);
  assert.equal(count("SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND status = 'pending'", TEEN), 0);
  assert.ok(count("SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND status = 'pending'", PARENT) > 0,
    'напоминания родителя остаются');

  const fresh = (await call('POST', '/api/plan/share', PARENT)).json();
  assert.notEqual(fresh.token, token);

  const again = await call('DELETE', '/api/plan/share', TEEN);
  assert.deepEqual(again.json(), { revoked: false, followersRemoved: 0 }, 'у подростка нет своей ссылки');
});

test('удаление данных убирает профиль, план, избранное, подписки и напоминания', async () => {
  const token = (await call('POST', '/api/plan/share', PARENT)).json().token;
  await call('PUT', `/api/shared-plans/${token}/follow`, TEEN, { follow: true });
  assert.equal((await call('DELETE', '/api/profile')).statusCode, 401, 'без подписи MAX нельзя');

  const response = await call('DELETE', '/api/profile', PARENT);
  assert.deepEqual(response.json(), { deleted: true });

  for (const table of ['users', 'plans', 'favorites', 'reminders']) {
    const column = table === 'users' ? 'max_user_id' : 'user_id';
    assert.equal(count(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`, PARENT), 0, table);
  }
  assert.equal(count('SELECT COUNT(*) AS count FROM plan_followers'), 0, 'подписки на удалённый план тоже удалены');
  assert.equal(count("SELECT COUNT(*) AS count FROM reminders WHERE user_id = ? AND status = 'pending'", TEEN), 0,
    'подросток больше не получает напоминания по удалённому плану');
  assert.equal(count('SELECT COUNT(*) AS count FROM events WHERE user_id = ?', PARENT), 0, 'ID в событиях обнулён');
  assert.ok(count("SELECT COUNT(*) AS count FROM events WHERE name = 'data_deleted' AND user_id IS NULL") >= 1);

  assert.equal((await call('GET', `/api/shared-plans/${token}`, TEEN)).statusCode, 404);
  const profile = (await call('GET', '/api/profile', PARENT)).json().profile;
  assert.equal(profile.isComplete, false, 'после удаления можно начать заново');

  const repeat = await call('DELETE', '/api/profile', PARENT);
  assert.equal(repeat.statusCode, 200, 'повторный запрос безопасен');
});
