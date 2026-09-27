import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXAM_ADVICE, EXAM_QUESTIONS, examChoiceFromPath, needsProfessionQuestion, recommendExams, TWO_OGE_REGIONS_2026,
} from '../src/exams.js';

const experiment = { regionId: 'tatarstan', twoOgeExperiment: true };

test('в регионе без эксперимента всегда четыре ОГЭ, второй вопрос не нужен', () => {
  for (const choice of ['college', 'unsure', 'school10']) {
    assert.deepEqual(recommendExams({ regionId: 'demo-standard', twoOgeExperiment: false, choice }), { exams: 4, reason: 'standard_region' });
    assert.equal(needsProfessionQuestion({ regionId: 'demo-standard', twoOgeExperiment: false, choice }), false);
  }
});

test('10 класс или сомнения — четыре ОГЭ: сохраняются оба пути', () => {
  assert.deepEqual(recommendExams({ ...experiment, choice: 'school10' }), { exams: 4, reason: 'school10' });
  assert.deepEqual(recommendExams({ ...experiment, choice: 'unsure' }), { exams: 4, reason: 'keep_both' });
  assert.equal(needsProfessionQuestion({ ...experiment, choice: 'unsure' }), false);
});

test('колледж в регионе эксперимента: ответ зависит от перечня профессий', () => {
  assert.equal(needsProfessionQuestion({ ...experiment, choice: 'college' }), true);
  assert.deepEqual(recommendExams({ ...experiment, choice: 'college', profession: 'listed' }), { exams: 2, reason: 'college_listed' });
  assert.deepEqual(recommendExams({ ...experiment, choice: 'college', profession: 'not_listed' }), { exams: 4, reason: 'college_not_listed' });
  assert.deepEqual(recommendExams({ ...experiment, choice: 'college', profession: 'unknown' }), { exams: 4, reason: 'college_unknown' });
  // Не ответили на второй вопрос — безопасный вариант
  assert.deepEqual(recommendExams({ ...experiment, choice: 'college' }), { exams: 4, reason: 'college_unknown' });
});

test('«Другой регион»: для колледжа ответ зависит от того, идёт ли там эксперимент', () => {
  const other = { regionId: 'other', twoOgeExperiment: false };
  assert.deepEqual(recommendExams({ ...other, choice: 'college' }), { exams: null, reason: 'unknown_region' });
  assert.deepEqual(recommendExams({ ...other, choice: 'unsure' }), { exams: 4, reason: 'keep_both' });
  assert.equal(needsProfessionQuestion({ ...other, choice: 'college' }), false);
  assert.match(EXAM_ADVICE.unknown_region.text, /Татарстан/);
  assert.equal(TWO_OGE_REGIONS_2026.length, 12);
});

test('первый ответ подсказывается путём из опроса', () => {
  assert.equal(examChoiceFromPath('college'), 'college');
  assert.equal(examChoiceFromPath('school10'), 'school10');
  assert.equal(examChoiceFromPath('undecided'), 'unsure');
});

test('у каждой причины есть текст, у каждого варианта ответа — подпись', () => {
  const reasons = ['standard_region', 'school10', 'keep_both', 'college_listed', 'college_not_listed', 'college_unknown', 'unknown_region'];
  for (const reason of reasons) {
    assert.ok(EXAM_ADVICE[reason]?.title && EXAM_ADVICE[reason]?.text, reason);
  }
  for (const question of Object.values(EXAM_QUESTIONS)) {
    assert.equal(question.options.length, 3);
  }
});
