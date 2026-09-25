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

  const report = analytics.report();
  assert.match(report, /Прошли опрос: 1 \(50%\)/);
  assert.match(report, /Регионы: Демо-регион А: 1/);
  assert.match(report, /кнопка в напоминании: 1/);
  assert.match(report, /За 7 дней/);
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
