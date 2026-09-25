import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planText, plural, untilText } from '../src/bot/texts.js';

const region = { name: 'Республика Татарстан' };
const profile = { path: 'college' };
const item = (id, overrides) => ({
  id, title: `Пункт ${id}`, dateStart: '2027-03-01', dateEnd: null, isApproximate: false,
  status: 'upcoming', daysLeft: 10, done: false, ...overrides,
});

test('план в чате: ближайшие даты, остаток и выполненное', () => {
  const plan = {
    academicYear: '2026/2027', isAdvance: false, region, profile,
    items: [
      item('a', { status: 'past', done: true, dateStart: '2026-10-01' }),
      item('b', { status: 'current', dateStart: '2026-11-01', dateEnd: '2027-04-30', daysLeft: null }),
      item('c', { dateStart: '2027-02-10', daysLeft: 0 }),
      item('d', { dateStart: '2027-03-01', isApproximate: true }),
    ],
  };
  const text = planText(plan, { limit: 2 });
  assert.match(text, /^План на 2026\/2027 · Республика Татарстан · Колледж/);
  assert.match(text, /• 1 ноября — 30 апреля — Пункт b \(идёт сейчас\)/);
  assert.match(text, /• 10 февраля — Пункт c \(сегодня\)/);
  assert.doesNotMatch(text, /Пункт a/, 'прошедшие пункты не показываются');
  assert.match(text, /…и ещё 1/);
  assert.match(text, /Выполнено: 1 из 4\./);

  const full = planText(plan);
  assert.match(full, /• 1 марта, ориентировочно — Пункт d \(через 10 дней\)/);
  assert.doesNotMatch(full, /…и ещё/);
});

test('план для 8 класса без опубликованных дат объясняет, что будет дальше', () => {
  const text = planText({ academicYear: '2027/2028', isAdvance: true, region, profile, items: [] });
  assert.match(text, /Это план на 9 класс/);
  assert.match(text, /2027\/2028 учебного года ещё не опубликованы/);
});

test('сроки по-русски: дни с правильным окончанием, дальние даты — в месяцах', () => {
  assert.equal(plural(1, ['день', 'дня', 'дней']), 'день');
  assert.equal(plural(3, ['день', 'дня', 'дней']), 'дня');
  assert.equal(plural(11, ['день', 'дня', 'дней']), 'дней');
  assert.equal(plural(22, ['день', 'дня', 'дней']), 'дня');
  assert.equal(untilText(1), 'через 1 день');
  assert.equal(untilText(27), 'через 27 дней');
  assert.equal(untilText(45), 'через 45 дней');
  assert.equal(untilText(81), 'через 3 месяца');
  assert.equal(untilText(258), 'через 8 месяцев');
});
