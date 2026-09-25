import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  academicYearFor, buildPlan, daysBetween, localDateString, matchesProfile, nextAcademicYear, planPeriodLabel,
  planYearFor, previousAcademicYear, reminderSchedule, sendAtUtc,
} from '../src/plan.js';

const base = {
  academicYear: '2026/2027',
  scope: 'federal',
  regionId: null,
  path: 'any',
  experiment: 'any',
  dateEnd: null,
  reminders: [],
};

const keyDates = [
  { ...base, id: 'oge-application', dateStart: '2027-03-01', reminders: [{ anchor: 'start', daysBefore: 7 }] },
  { ...base, id: 'elective-choice', dateStart: '2027-02-20', experiment: 'standard' },
  { ...base, id: 'college-admission', dateStart: '2027-06-20', dateEnd: '2027-08-15', path: 'college',
    reminders: [{ anchor: 'start', daysBefore: 0 }, { anchor: 'end', daysBefore: 5 }] },
  { ...base, id: 'profile-selection', scope: 'regional', regionId: 'demo-1', dateStart: '2027-06-25', path: 'school10' },
  { ...base, id: 'other-region', scope: 'regional', regionId: 'demo-2', dateStart: '2027-06-01' },
  { ...base, id: 'old-year', academicYear: '2025/2026', dateStart: '2026-03-01' },
];

const profile = { academicYear: '2026/2027', regionId: 'demo-1', path: 'college', twoOgeExperiment: false };

test('шаги 8 класса: только восьмикласснику, из года перед планом 9 класса', () => {
  const prep = { ...base, id: 'grade8-step', grade: 8, dateStart: '2027-03-01' };
  const nextYearDate = { ...base, id: 'next-year', academicYear: '2027/2028', dateStart: '2028-03-01' };
  const eighthGrader = { ...profile, academicYear: '2027/2028', grade: 8 };
  assert.ok(matchesProfile(prep, eighthGrader));
  assert.ok(matchesProfile(nextYearDate, eighthGrader), 'даты его 9 класса');
  assert.ok(!matchesProfile(keyDates[0], eighthGrader), 'даты 9 класса текущего года — не его');
  assert.ok(!matchesProfile(prep, { ...profile, grade: 9 }), 'девятикласснику шаги 8 класса не нужны');
  assert.ok(!matchesProfile(prep, profile), 'без класса — как раньше, план 9 класса');
  assert.equal(previousAcademicYear('2027/2028'), '2026/2027');
  assert.equal(planPeriodLabel({ academicYear: '2027/2028', isAdvance: true }), '8–9 класс, 2026–2028');
  assert.equal(planPeriodLabel({ academicYear: '2026/2027', isAdvance: false }), '2026/2027');
});

test('учебный год переключается в августе', () => {
  assert.equal(academicYearFor(new Date('2026-07-31T12:00:00Z')), '2025/2026');
  assert.equal(academicYearFor(new Date('2026-08-01T12:00:00Z')), '2026/2027');
  assert.equal(academicYearFor(new Date('2027-03-01T12:00:00Z')), '2026/2027');
});

test('локальная дата учитывает часовой пояс региона', () => {
  const now = new Date('2026-09-30T22:30:00Z');
  assert.equal(localDateString(now, 0), '2026-09-30');
  assert.equal(localDateString(now, 3), '2026-10-01');
  assert.equal(daysBetween('2026-10-01', '2026-10-11'), 10);
});

test('фильтр по региону, пути и эксперименту', () => {
  assert.ok(matchesProfile(keyDates[0], profile));
  assert.ok(matchesProfile(keyDates[1], profile));
  assert.ok(!matchesProfile(keyDates[1], { ...profile, twoOgeExperiment: true }));
  assert.ok(matchesProfile(keyDates[2], profile));
  assert.ok(!matchesProfile(keyDates[3], profile), 'путь school10 не показывается при выборе колледжа');
  assert.ok(matchesProfile(keyDates[3], { ...profile, path: 'undecided' }), 'пока не решили — показываем оба пути');
  assert.ok(!matchesProfile(keyDates[4], profile), 'даты другого региона не показываются');
  assert.ok(!matchesProfile(keyDates[5], profile), 'даты другого учебного года не показываются');
});

test('план отсортирован, содержит статусы и отметки', () => {
  const plan = buildPlan({
    keyDates,
    profile,
    doneIds: ['elective-choice'],
    now: new Date('2027-02-25T09:00:00Z'),
  });

  assert.deepEqual(plan.items.map((item) => item.id), ['elective-choice', 'oge-application', 'college-admission']);
  assert.equal(plan.items[0].status, 'past');
  assert.equal(plan.items[0].done, true);
  assert.equal(plan.items[1].status, 'upcoming');
  assert.equal(plan.items[1].daysLeft, 4);
  assert.equal(plan.nextItemId, 'oge-application');
});

test('период в процессе имеет статус current', () => {
  const plan = buildPlan({ keyDates, profile, now: new Date('2027-07-01T09:00:00Z') });
  const admission = plan.items.find((item) => item.id === 'college-admission');
  assert.equal(admission.status, 'current');
  assert.equal(admission.daysLeft, null);
});

test('напоминания: в 10:00 по местному времени и только в будущем', () => {
  assert.equal(sendAtUtc('2027-03-01', 7, 10, 3).toISOString(), '2027-02-22T07:00:00.000Z');

  const plan = buildPlan({ keyDates, profile, now: new Date('2027-02-25T09:00:00Z') });
  const schedule = reminderSchedule({ items: plan.items, utcOffsetHours: 3, now: new Date('2027-02-25T09:00:00Z') });

  // Напоминание за 7 дней до 1 марта (22 февраля) уже в прошлом
  assert.deepEqual(schedule.map((entry) => `${entry.keyDateId}:${entry.anchor}:${entry.daysBefore}`), [
    'college-admission:start:0',
    'college-admission:end:5',
  ]);
  assert.equal(schedule[1].sendAt, '2027-08-10T07:00:00.000Z');
});

test('восьмикласснику строится план на следующий учебный год', () => {
  assert.equal(nextAcademicYear('2026/2027'), '2027/2028');
  assert.equal(planYearFor(9, '2026/2027'), '2026/2027');
  assert.equal(planYearFor(8, '2026/2027'), '2027/2028');
});
