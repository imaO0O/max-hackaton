import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateAttestat, finalGrade, roundFinalGrade } from '../src/grades.js';

test('итоговая отметка по предмету ОГЭ — среднее с математическим округлением', () => {
  assert.equal(roundFinalGrade(3.5), 4);
  assert.equal(roundFinalGrade(4.5), 5);
  assert.deepEqual(finalGrade({ annual: 4, exam: 5, takesExam: true }), { grade: 5, awaitingExam: false });
  assert.deepEqual(finalGrade({ annual: 4, exam: 3, takesExam: true }), { grade: 4, awaitingExam: false });
  assert.deepEqual(finalGrade({ annual: 3, exam: 3, takesExam: true }), { grade: 3, awaitingExam: false });
});

test('без экзаменационной отметки берётся годовая и помечается ожидание экзамена', () => {
  assert.deepEqual(finalGrade({ annual: 4, exam: null, takesExam: true }), { grade: 4, awaitingExam: true });
});

test('некорректные и пустые оценки не учитываются', () => {
  assert.deepEqual(finalGrade({ annual: 6 }), { grade: null, awaitingExam: false });
  assert.deepEqual(finalGrade({ annual: null }), { grade: null, awaitingExam: false });
  assert.deepEqual(finalGrade({ annual: 4.5 }), { grade: null, awaitingExam: false });
});

test('средний балл и потенциал роста', () => {
  const result = calculateAttestat([
    { id: 'russian', title: 'Русский язык', annual: 4, exam: 5, takesExam: true },
    { id: 'math', title: 'Математика', annual: 3, takesExam: true },
    { id: 'history', title: 'История', annual: 5 },
    { id: 'music', title: 'Музыка', annual: 4, finishedEarlier: true },
  ]);

  // Итоговые: 5, 3, 5, 4 → 17 / 4 = 4.25
  assert.equal(result.average, 4.25);
  assert.equal(result.gradedCount, 4);
  assert.equal(result.awaitingExamCount, 1);
  // Музыка завершена раньше, история уже 5 — повлиять можно только на математику
  assert.deepEqual(result.influenceable.map((row) => row.id), ['math']);
  assert.equal(result.influenceable[0].deltaIfPlusOne, 0.25);
  // Математика 3 → 4: 18 / 4 = 4.5
  assert.equal(result.potentialAverage, 4.5);
  assert.ok(result.warnings.includes('awaiting_exam'));
});

test('пустой список оценок', () => {
  const result = calculateAttestat([{ id: 'russian', title: 'Русский язык' }]);
  assert.equal(result.average, null);
  assert.equal(result.potentialAverage, null);
  assert.ok(result.warnings.includes('incomplete'));
});

test('двойка даёт предупреждение', () => {
  const result = calculateAttestat([{ id: 'physics', title: 'Физика', annual: 2 }]);
  assert.ok(result.warnings.includes('unsatisfactory'));
});
