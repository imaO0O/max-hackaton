import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { campaignOf, EVENTS, launchSource } from '../src/services/analytics.js';
import { authHeaders, createTestApp } from './helpers.js';

test('источник открытия мини-приложения по параметру запуска', () => {
  assert.equal(launchSource(null), 'direct');
  assert.equal(launchSource('from_bot'), 'bot');
  assert.equal(launchSource('from_reminder'), 'reminder');
  assert.equal(launchSource('plan_AAAAAAAAAAAAAAAA'), 'shared_link');
  assert.equal(launchSource('src_school5'), 'campaign');
  assert.equal(campaignOf('src_kazan_school5_9a'), 'kazan_school5_9a');
  assert.equal(campaignOf('src_'), null);
  assert.equal(campaignOf('src_школа'), null, 'только символы параметра запуска MAX');
  assert.equal(campaignOf('from_bot'), null);
  assert.equal(launchSource('something'), 'other');
});

let ctx;
const PARENT = 9001;
const TEEN = 9002;

before(async () => {
  ctx = createTestApp();
  await ctx.app.ready();
});

after(async () => {
  await ctx.app.close();
  ctx.db.close();
});

const call = (method, url, user, { body, startParam } = {}) => ctx.app.inject({
  method, url, headers: authHeaders(user, { startParam }), payload: body,
});

test('воронка пилота считается по событиям основного сценария', async () => {
  const { analytics } = ctx.services;
  // Опрос идёт в боте — события пишет бот
  analytics.track(EVENTS.SURVEY_STARTED, PARENT);
  analytics.track(EVENTS.SURVEY_STARTED, TEEN);
  await call('PUT', '/api/profile', PARENT, { body: { regionId: 'demo-standard', grade: 9, path: 'college', interests: ['it'] } });
  analytics.track(EVENTS.SURVEY_COMPLETED, PARENT, { regionId: 'demo-standard', path: 'college', grade: 9 });

  await call('GET', '/api/session', PARENT, { startParam: 'from_bot' });
  await call('GET', '/api/session', PARENT, { startParam: 'from_reminder' });

  const college = (await call('GET', '/api/colleges?regionId=demo-standard&interests=it', PARENT)).json().colleges[0];
  await call('PUT', `/api/favorites/${college.programs[0].id}`, PARENT);
  await call('PUT', '/api/plan/items/2627-rec-talk-interests', PARENT, { body: { done: true } });
  await call('PUT', '/api/plan/items/2627-rec-talk-interests', PARENT, { body: { done: false } });

  const { token } = (await call('POST', '/api/plan/share', PARENT)).json();
  assert.equal(analytics.funnel().family.shared, 0, 'ссылка, подготовленная заранее, — ещё не отправка');
  await call('POST', '/api/plan/share/sent', PARENT);
  await call('GET', `/api/shared-plans/${token}`, PARENT);
  await call('GET', '/api/session', TEEN, { startParam: `plan_${token}` });
  await call('GET', `/api/shared-plans/${token}`, TEEN);
  await call('PUT', `/api/shared-plans/${token}/follow`, TEEN, { body: { follow: true } });

  const funnel = analytics.funnel();
  assert.equal(funnel.surveyStarted, 2);
  assert.equal(funnel.surveyCompleted, 1);
  assert.equal(funnel.miniappOpened, 2);
  assert.equal(funnel.openedFromReminder, 1);
  assert.equal(funnel.sharedPlanOpened, 1, 'владелец, открывший свою ссылку, не считается');
  assert.equal(funnel.followStarted, 1);
  assert.equal(funnel.itemsDone, 1, 'снятие отметки не считается');
  assert.equal(funnel.favoritesAdded, 1);
  assert.deepEqual(funnel.completedByPath, [{ value: 'college', users: 1 }]);
  assert.deepEqual(funnel.family, { shared: 1, opened: 1, connected: 1 }, 'по семьям: владелец, открывший свою ссылку, не считается');

  const report = analytics.report();
  assert.match(report, /Прошли опрос: 1 \(50%\)/);
  assert.match(report, /Регионы: Демо-регион А: 1/);
  assert.match(report, /кнопка в напоминании: 1/);
  assert.match(report, /За 7 дней/);
  assert.match(report, /подключился подросток или второй родитель — 1 из 1 \(100%\)/);
  const props = ctx.repos.events.list(EVENTS.FOLLOW_STARTED, '1970-01-01T00:00:00.000Z')[0].props;
  assert.equal(typeof props.planId, 'number');
  assert.ok(!JSON.stringify(props).includes(String(PARENT)), 'в событии нет ID владельца в MAX');
});

test('шаг на эту неделю: за неделю, позже, «ещё нет» и без ответа — по первому шагу семьи', () => {
  const app = createTestApp({ now: '2026-10-19T09:00:00Z' });
  const { weekStep, plan } = app.services;
  for (const id of [701, 702, 703, 704]) {
    plan.saveProfile(id, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });
    weekStep.offer(id, { from: 'bot' });
  }
  weekStep.offer(705, { from: 'bot' }); // предложили, но не выбрали
  const step = (id) => weekStep.choose(id, 'interests', { from: 'bot' }).current.id;
  const first = { 701: step(701), 702: step(702), 703: step(703), 704: step(704) };
  app.clock.now = new Date('2026-10-24T09:00:00Z');
  weekStep.answer(701, first[701], 'done'); // через 5 дней
  weekStep.answer(702, first[702], 'not_yet');
  weekStep.answer(704, first[704], 'not_yet');
  app.clock.now = new Date('2026-10-30T09:00:00Z');
  weekStep.answer(704, first[704], 'done'); // через 11 дней — позже недели
  const next = weekStep.choose(701, 'open_day').current.id; // второй шаг — только в «всего выполнено»
  weekStep.answer(701, next, 'done');

  assert.deepEqual(app.services.analytics.funnel(null).weekStep, {
    offered: 5, chosen: 4, doneInWeek: 1, doneLater: 1, notYet: 1, waiting: 1, totalDone: 3,
  });
  assert.match(app.services.analytics.report(), /Шаг на эту неделю, семьи: предложили — 5, выбрали — 4 \(80%\)/);
  assert.match(app.services.analytics.report(), /выполнили за неделю: 1 из 4 \(25%\); позже — 1; «ещё нет» — 1; ждём ответа — 1; всего выполнено шагов: 3/);
  app.db.close();
});

test('ошибка записи события не ломает сценарий', () => {
  const warnings = [];
  const broken = { events: { insert() { throw new Error('disk full'); } }, reference: ctx.repos.reference };
  return import('../src/services/analytics.js').then(({ createAnalytics }) => {
    const analytics = createAnalytics({ repos: broken, logger: { warn: (...args) => warnings.push(args) } });
    assert.doesNotThrow(() => analytics.track(EVENTS.SURVEY_STARTED, 1));
    assert.equal(warnings.length, 1);
  });
});

test('реально выполненный шаг: ключевой шаг до 1 марта, отметка после срока и снятая отметка не считаются', () => {
  const app = createTestApp({ now: '2027-02-20T09:00:00Z' });
  const { analytics, plan } = app.services;
  const family = (id, grade = 9) => {
    plan.saveProfile(id, { regionId: 'demo-standard', grade, path: 'college', interests: [] });
    analytics.track(EVENTS.SURVEY_COMPLETED, id, { grade });
  };
  const KEY = '2627-fed-gia-application'; // заявление на ОГЭ, 1 марта — ключевой шаг
  const mark = (id, itemId, from) => {
    plan.setItemDone(id, itemId, true);
    analytics.track(EVENTS.ITEM_DONE, id, { itemId, from });
  };
  family(501); family(502); family(503);
  mark(501, KEY, 'reminder'); // до 1 марта — ключевой шаг выполнен
  mark(503, KEY, 'chat');
  plan.setItemDone(503, KEY, false); // отметку сняли — не считается
  app.clock.now = new Date('2027-03-05T09:00:00Z');
  mark(502, KEY, 'chat'); // после срока — не считается
  analytics.track(EVENTS.ITEM_DONE, 504, { itemId: KEY }); // план не собирал — не в выборке
  const { steps } = analytics.funnel(null);
  assert.deepEqual(steps, {
    families: 3, onTime: 1, fromReminder: 1, ninthGrade: 3, keyStep: 1,
  });
  const report = analytics.report();
  assert.match(report, /Ключевой шаг — заявление на ОГЭ отмечено до 1 марта: 1 из 3 семей 9 класса \(33%\)/);
  assert.match(report, /Любой шаг плана в срок: 1 из 3 собравших план/);
  app.db.close();
});
