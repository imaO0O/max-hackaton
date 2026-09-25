import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReminderScheduler } from '../src/scheduler/reminder-scheduler.js';
import { reminderText } from '../src/bot/texts.js';
import { createTestApp } from './helpers.js';

const silentLogger = { info() {}, warn() {}, error() {} };

function setup(now) {
  const ctx = createTestApp({ now });
  const sent = [];
  let failWith = null;
  const scheduler = createReminderScheduler({
    repos: ctx.repos,
    runtime: ctx.runtime,
    logger: silentLogger,
    intervalMs: 60_000,
    clock: () => ctx.clock.now,
    sendMessage: async (userId, text, extra) => {
      if (failWith) throw failWith;
      sent.push({ userId, text, extra });
    },
  });
  return { ctx, sent, scheduler, failNextWith: (error) => { failWith = error; } };
}

test('напоминание уходит в срок и не отправляется повторно', async () => {
  const { ctx, sent, scheduler } = setup('2027-01-27T06:00:00Z');
  ctx.services.plan.saveProfile(1, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });

  // 2027-01-27 10:00 МСК — напоминание «за 14 дней» до итогового собеседования (10 февраля)
  ctx.clock.now = new Date('2027-01-27T07:00:30Z');
  const result = await scheduler.tick();
  assert.equal(result.sent, 1);
  assert.equal(sent[0].userId, 1);
  assert.match(sent[0].text, /Итоговое собеседование/);
  assert.match(sent[0].text, /Через 14 дней — 10 февраля/);
  assert.equal(sent[0].extra.attachments[0].type, 'inline_keyboard');
  const buttons = sent[0].extra.attachments[0].payload.buttons.flat();
  assert.deepEqual(
    buttons.map((button) => button.payload),
    ['from_reminder', 'rdone:2627-fed-final-interview', 'ritem:2627-fed-final-interview'],
    'кнопки: открыть план (метка источника), «Сделано», «Подробнее»',
  );

  const again = await scheduler.tick();
  assert.equal(again.sent, 0);
  ctx.db.close();
});

test('при выключенных напоминаниях ничего не отправляется', async () => {
  const { ctx, sent, scheduler } = setup('2027-01-27T06:00:00Z');
  ctx.services.plan.saveProfile(2, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });
  ctx.services.plan.setRemindersEnabled(2, false);
  ctx.clock.now = new Date('2027-01-27T07:00:30Z');
  await scheduler.tick();
  assert.equal(sent.length, 0);
  ctx.db.close();
});

test('опоздавшие больше чем на сутки напоминания не отправляются', async () => {
  const { ctx, sent, scheduler } = setup('2027-01-27T06:00:00Z');
  ctx.services.plan.saveProfile(3, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });
  ctx.clock.now = new Date('2027-01-29T08:00:00Z');
  await scheduler.tick();
  assert.equal(sent.length, 0);
  ctx.db.close();
});

test('ошибка отправки: повтор, а после 403 — без повторов', async () => {
  const { ctx, scheduler, failNextWith } = setup('2027-01-27T06:00:00Z');
  ctx.services.plan.saveProfile(4, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });
  ctx.clock.now = new Date('2027-01-27T07:00:30Z');

  failNextWith(Object.assign(new Error('network'), {}));
  await scheduler.tick();
  const [temporary] = ctx.repos.reminders.listDue(ctx.clock.now);
  assert.equal(temporary.attempts, 1, 'временная ошибка — напоминание остаётся в очереди');

  failNextWith(Object.assign(new Error('forbidden'), { status: 403 }));
  await scheduler.tick();
  assert.equal(ctx.repos.reminders.listDue(ctx.clock.now).length, 0, 'после 403 напоминание снимается');
  ctx.db.close();
});

test('текст напоминания для периода и окончания срока', () => {
  const keyDate = {
    title: 'Приём документов в колледжи', description: 'Описание', kind: 'period',
    dateStart: '2027-06-20', dateEnd: '2027-08-15', isApproximate: false,
  };
  assert.match(reminderText({ keyDate, anchor: 'start', daysBefore: 0 }), /Начинается сегодня \(20 июня\)/);
  assert.match(reminderText({ keyDate, anchor: 'end', daysBefore: 7 }), /До окончания — 7 дней \(до 15 августа\)/);
  assert.match(reminderText({ keyDate, anchor: 'start', daysBefore: 1 }), /Завтра, 20 июня/);
});

test('подписчику по чужому плану напоминание приходит без кнопки «Сделано»', async () => {
  const { ctx, sent, scheduler } = setup('2027-01-27T06:00:00Z');
  ctx.runtime.botUsername = 'posle9_test_bot';
  ctx.services.plan.saveProfile(10, { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] });
  const { token } = ctx.services.plan.createShareLink(10);
  ctx.services.plan.setFollowing(11, token, true);
  ctx.clock.now = new Date('2027-01-27T07:00:30Z');
  await scheduler.tick();
  const teen = sent.find((message) => message.userId === 11);
  const parent = sent.find((message) => message.userId === 10);
  const payloads = (message) => message.extra.attachments[0].payload.buttons.flat().map((button) => button.payload);
  assert.ok(payloads(parent).some((payload) => payload.startsWith('rdone:')));
  assert.ok(!payloads(teen).some((payload) => payload.startsWith('rdone:')));
  ctx.db.close();
});
