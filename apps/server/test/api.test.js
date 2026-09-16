import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { authHeaders, createTestApp } from './helpers.js';

const PARENT = 1001;
const TEEN = 2002;

describe('API мини-приложения', () => {
  let ctx;

  before(async () => {
    ctx = createTestApp();
    await ctx.app.ready();
  });

  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  const call = (method, url, { user, body, headers } = {}) => ctx.app.inject({
    method,
    url,
    headers: { ...(user ? authHeaders(user) : {}), ...headers },
    payload: body,
  });

  test('health', async () => {
    const response = await call('GET', '/api/health');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'ok');
  });

  test('справочники: регионы, города, сферы', async () => {
    const regions = (await call('GET', '/api/regions')).json().regions;
    assert.ok(regions.length >= 2);
    assert.ok(regions.some((region) => region.twoOgeExperiment));

    const cities = (await call('GET', '/api/regions/demo-standard/cities')).json().cities;
    assert.deepEqual(cities, ['Демоград', 'Приречный']);

    const missing = await call('GET', '/api/regions/unknown/cities');
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, 'not_found');
  });

  test('поиск колледжей по фильтрам', async () => {
    const all = (await call('GET', '/api/colleges?regionId=demo-standard')).json().colleges;
    assert.ok(all.length >= 10);

    const it = (await call('GET', '/api/colleges?regionId=demo-standard&interests=it&city=Демоград')).json().colleges;
    assert.ok(it.length > 0);
    assert.ok(it.every((college) => college.city === 'Демоград'));
    assert.ok(it.every((college) => college.programs.every((program) => program.interestId === 'it')));

    const budget = (await call('GET', '/api/colleges?regionId=demo-standard&form=extramural&budgetOnly=true')).json().colleges;
    assert.equal(budget.length, 0, 'у заочных демо-программ нет бюджетных мест');

    const invalid = await call('GET', '/api/colleges?regionId=demo-standard&form=online');
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'validation_error');
  });

  test('без подписи мини-приложения личные данные недоступны', async () => {
    const response = await call('GET', '/api/plan');
    assert.equal(response.statusCode, 401);
    const forged = await call('GET', '/api/plan', { headers: { 'x-max-init-data': 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=00' } });
    assert.equal(forged.statusCode, 401);
    const bypass = await call('GET', '/api/plan', { headers: { 'x-dev-user-id': '1' } });
    assert.equal(bypass.statusCode, 401, 'обход авторизации выключен по умолчанию');
  });

  test('план недоступен, пока не заполнен профиль', async () => {
    const response = await call('GET', '/api/plan', { user: PARENT });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, 'profile_incomplete');
  });

  test('профиль проверяется', async () => {
    const badRegion = await call('PUT', '/api/profile', { user: PARENT, body: { regionId: 'nope', grade: 9, path: 'college' } });
    assert.equal(badRegion.statusCode, 400);
    const badGrade = await call('PUT', '/api/profile', { user: PARENT, body: { regionId: 'demo-standard', grade: 7, path: 'college' } });
    assert.equal(badGrade.statusCode, 400);
    const badCity = await call('PUT', '/api/profile', { user: PARENT, body: { regionId: 'demo-standard', city: 'Москва', grade: 9, path: 'college' } });
    assert.equal(badCity.statusCode, 400);
  });

  test('основной сценарий: профиль → план → отметка → избранное → отправка подростку', async () => {
    const saved = await call('PUT', '/api/profile', {
      user: PARENT,
      body: { regionId: 'demo-standard', city: 'Демоград', grade: 9, path: 'college', interests: ['it', 'medicine'] },
    });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().profile.isComplete, true);

    const plan = (await call('GET', '/api/plan', { user: PARENT })).json();
    const ids = plan.items.map((item) => item.id);
    assert.ok(ids.includes('2627-fed-college-admission'), 'для колледжа есть приём документов');
    assert.ok(ids.includes('2627-fed-gia-application'), 'регион без эксперимента — выбор двух предметов');
    assert.ok(!ids.includes('2627-fed-gia-application-two-oge'));
    assert.ok(!ids.includes('2627-reg-demo-standard-profile-selection'), 'путь колледжа — без отбора в 10 класс');
    assert.ok(plan.pendingReminders > 0, 'напоминания запланированы');
    assert.equal(plan.items[0].status, 'upcoming');

    const done = await call('PUT', '/api/plan/items/2627-rec-talk-interests', { user: PARENT, body: { done: true } });
    assert.equal(done.statusCode, 200);
    const replanned = (await call('GET', '/api/plan', { user: PARENT })).json();
    assert.equal(replanned.items.find((item) => item.id === '2627-rec-talk-interests').done, true);
    assert.ok(replanned.pendingReminders < plan.pendingReminders, 'по выполненному пункту напоминания не нужны');

    const foreignItem = await call('PUT', '/api/plan/items/2627-reg-demo-two-oge-open-day', { user: PARENT, body: { done: true } });
    assert.equal(foreignItem.statusCode, 404);

    const college = (await call('GET', '/api/colleges?regionId=demo-standard&interests=it')).json().colleges[0];
    const programId = college.programs[0].id;
    assert.equal((await call('PUT', `/api/favorites/${programId}`, { user: PARENT })).statusCode, 200);
    assert.equal((await call('PUT', `/api/favorites/${programId}`, { user: PARENT })).statusCode, 200, 'повторное добавление идемпотентно');
    const favorites = (await call('GET', '/api/favorites', { user: PARENT })).json().favorites;
    assert.equal(favorites.length, 1);
    assert.equal(favorites[0].college.id, college.id);

    const share = (await call('POST', '/api/plan/share', { user: PARENT })).json();
    assert.match(share.link, /^https:\/\/max\.ru\/posle9_test_bot\?startapp=plan_[A-Za-z0-9_-]+$/);
    const shareAgain = (await call('POST', '/api/plan/share', { user: PARENT })).json();
    assert.equal(shareAgain.token, share.token, 'ссылка стабильна');

    const shared = await call('GET', `/api/shared-plans/${share.token}`, { user: TEEN });
    assert.equal(shared.statusCode, 200);
    assert.equal(shared.json().isOwner, false);
    assert.equal(shared.json().isFollowing, false);
    assert.equal(shared.json().favorites.length, 1);

    const follow = await call('PUT', `/api/shared-plans/${share.token}/follow`, { user: TEEN, body: { follow: true } });
    assert.deepEqual(follow.json(), { isFollowing: true });
    assert.ok(ctx.repos.reminders.countPending(TEEN) > 0, 'подросток получает напоминания по плану родителя');

    const unfollow = await call('PUT', `/api/shared-plans/${share.token}/follow`, { user: TEEN, body: { follow: false } });
    assert.deepEqual(unfollow.json(), { isFollowing: false });
    assert.equal(ctx.repos.reminders.countPending(TEEN), 0);

    const ownFollow = await call('PUT', `/api/shared-plans/${share.token}/follow`, { user: PARENT, body: { follow: true } });
    assert.equal(ownFollow.statusCode, 400);

    const badToken = await call('GET', '/api/shared-plans/AAAAAAAAAAAAAAAAAAAAAA', { user: TEEN });
    assert.equal(badToken.statusCode, 404);
  });

  test('регион эксперимента меняет план', async () => {
    const user = 3003;
    await call('PUT', '/api/profile', { user, body: { regionId: 'demo-two-oge', grade: 9, path: 'undecided', interests: [] } });
    const ids = (await call('GET', '/api/plan', { user })).json().items.map((item) => item.id);
    assert.ok(ids.includes('2627-fed-gia-application-two-oge'));
    assert.ok(!ids.includes('2627-fed-gia-application'));
    assert.ok(ids.includes('2627-reg-demo-two-oge-profile-selection'), 'пока не решили — видны оба пути');
    assert.ok(ids.includes('2627-fed-college-admission'));
    assert.ok(!ids.includes('2627-reg-demo-standard-fair'), 'даты другого региона не попадают');
  });

  test('регион эксперимента: путь в 10 класс не теряет выбор предметов ОГЭ', async () => {
    const user = 3004;
    await call('PUT', '/api/profile', { user, body: { regionId: 'demo-two-oge', grade: 9, path: 'school10', interests: [] } });
    const items = (await call('GET', '/api/plan', { user })).json().items;
    const ids = items.map((item) => item.id);
    assert.ok(ids.includes('2627-rec-profile-choice'), 'профиль 10 класса нужно выбрать и в регионе эксперимента');
    const application = items.find((item) => item.id === '2627-fed-gia-application-two-oge');
    assert.match(application.description, /четыр/, 'для 10 класса нужны четыре ОГЭ');
  });

  test('выключение напоминаний', async () => {
    const response = await call('PUT', '/api/profile/reminders', { user: PARENT, body: { enabled: false } });
    assert.equal(response.json().profile.remindersEnabled, false);
  });

  test('неизвестный маршрут API — JSON 404', async () => {
    const response = await call('GET', '/api/unknown');
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'not_found');
  });
});

describe('локальная разработка', () => {
  test('X-Dev-User-Id работает только при AUTH_DEV_BYPASS', async () => {
    const ctx = createTestApp({ config: { authDevBypass: true } });
    const response = await ctx.app.inject({ method: 'GET', url: '/api/profile', headers: { 'x-dev-user-id': '42' } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().profile.isComplete, false);
    await ctx.app.close();
    ctx.db.close();
  });

  test('без токена бота ссылку на план не создать', async () => {
    const ctx = createTestApp({ config: { botUsername: null } });
    ctx.runtime.botUsername = null;
    const user = 5005;
    await ctx.app.inject({ method: 'PUT', url: '/api/profile', headers: authHeaders(user), payload: { regionId: 'demo-standard', grade: 9, path: 'college' } });
    const response = await ctx.app.inject({ method: 'POST', url: '/api/plan/share', headers: authHeaders(user) });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'bot_unavailable');
    await ctx.app.close();
    ctx.db.close();
  });
});

describe('раздача мини-приложения', () => {
  test('SPA: маршруты отдают index.html, отсутствующие файлы и /api — 404', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'posle9-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');

    const ctx = createTestApp({ config: { miniappDistDir: dist } });
    const page = await ctx.app.inject({ method: 'GET', url: '/plan?startapp=x' });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'], /text\/html/);

    const asset = await ctx.app.inject({ method: 'GET', url: '/assets/app.js' });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers['content-type'], /javascript/);

    // Файл, появившийся после старта сервера (пересборка), тоже раздаётся
    fs.writeFileSync(path.join(dist, 'assets', 'new.js'), 'console.log(2)');
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/assets/new.js' })).statusCode, 200);

    assert.equal((await ctx.app.inject({ method: 'GET', url: '/assets/missing.js' })).statusCode, 404);
    const api = await ctx.app.inject({ method: 'GET', url: '/api/nope' });
    assert.equal(api.statusCode, 404);
    assert.equal(api.json().error.code, 'not_found');

    await ctx.app.close();
    ctx.db.close();
    fs.rmSync(dist, { recursive: true, force: true });
  });
});
