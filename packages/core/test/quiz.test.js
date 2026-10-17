import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUIZ_QUESTIONS, quizResult, summarizeQuiz } from '../src/quiz.js';

test('три вопроса, у каждого ровно один верный вариант', () => {
  assert.equal(QUIZ_QUESTIONS.length, 3);
  for (const question of QUIZ_QUESTIONS) {
    assert.ok(question.correct >= 0 && question.correct < question.options.length, question.id);
    assert.ok(question.explanation.length > 0);
    for (const option of question.options) assert.ok(option.length <= 34, `подпись кнопки помещается на телефоне: ${option}`);
  }
});

test('маска верных ответов → результат', () => {
  assert.deepEqual(quizResult(0b101), {
    answers: { deadline: true, two_oge: false, colleges: true }, score: 2, total: 3,
  });
});

test('сводка: доля верных до и после, сдвиг у ответивших оба раза, последняя попытка в фазе', () => {
  const attempt = (userId, phase, mask) => ({ userId, phase, ...quizResult(mask) });
  const summary = summarizeQuiz([
    attempt(1, 'before', 0b001),
    attempt(1, 'after', 0b011),
    attempt(1, 'after', 0b111), // повтор «после» — считается последняя попытка
    attempt(2, 'before', 0b000),
    attempt(3, 'after', 0b110),
  ]);
  assert.deepEqual(summary.before, { people: 2, percent: 17 });
  assert.deepEqual(summary.after, { people: 2, percent: 83 });
  assert.deepEqual(summary.paired, { people: 1, before: 1, after: 3 });
  assert.deepEqual(summary.byQuestion.find((row) => row.id === 'two_oge'), {
    id: 'two_oge', title: 'два ОГЭ и 10 класс', before: 0, after: 100,
  });
});
