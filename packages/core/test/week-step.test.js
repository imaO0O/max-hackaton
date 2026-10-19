import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeWeekSteps, weekStepById, weekStepCheckAt, weekStepOptions,
} from '../src/week-step.js';

test('варианты шага по профилю: ОГЭ — 9 классу, колледж или профиль — по пути', () => {
  const ids = (profile) => weekStepOptions(profile).map((step) => step.id);
  assert.deepEqual(ids({ grade: 9, path: 'college', twoOgeExperiment: true }), ['teacher_two_oge', 'open_day', 'interests']);
  assert.deepEqual(ids({ grade: 9, path: 'undecided' }), ['teacher_oge', 'open_day', 'interests']);
  assert.deepEqual(ids({ grade: 9, path: 'school10' }), ['teacher_oge', 'profile_class', 'interests']);
  assert.deepEqual(ids({ grade: 8, path: 'school10' }), ['profile_class', 'interests']);
  for (const step of weekStepOptions({ grade: 9, path: 'college', twoOgeExperiment: true })) {
    assert.ok(step.button.length <= 34, `подпись кнопки помещается на телефоне: ${step.button}`);
  }
  assert.equal(weekStepById('nope'), null);
  assert.equal(weekStepById('toString'), null, 'только свои шаги');
});

test('вопрос «Получилось?» — через 5 дней в 10:00 по времени региона', () => {
  assert.equal(weekStepCheckAt(new Date('2026-10-19T09:00:00Z'), 3), '2026-10-24T07:00:00.000Z');
  // 00:30 по Москве — это уже 20 октября
  assert.equal(weekStepCheckAt(new Date('2026-10-19T21:30:00Z'), 3), '2026-10-25T07:00:00.000Z');
  assert.equal(weekStepCheckAt(new Date('2026-10-19T09:00:00Z'), 5), '2026-10-24T05:00:00.000Z');
});

test('сводка по первому шагу семьи: «ещё нет», а потом «сделано» — выполнено', () => {
  const at = (day) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`;
  const summary = summarizeWeekSteps({
    offered: [1, 2, 3, 9],
    chosen: [
      { userId: 1, weekStepId: 10, createdAt: at(19) },
      { userId: 2, weekStepId: 11, createdAt: at(19) },
      { userId: 3, weekStepId: 12, createdAt: at(19) },
      { userId: 1, weekStepId: 13, createdAt: at(24) },
    ],
    answered: [
      { weekStepId: 10, result: 'done', createdAt: at(24) },
      { weekStepId: 11, result: 'not_yet', createdAt: at(24) },
      { weekStepId: 11, result: 'done', createdAt: at(25) },
      { weekStepId: 13, result: 'done', createdAt: at(29) },
    ],
  });
  assert.deepEqual(summary, {
    offered: 4, chosen: 3, doneInWeek: 2, doneLater: 0, notYet: 0, waiting: 1, totalDone: 3,
  });
});
