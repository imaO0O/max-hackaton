/**
 * Калькулятор среднего балла аттестата об основном общем образовании.
 *
 * Правило (сверить с действующим порядком выдачи аттестатов перед пилотом):
 * по предметам, которые сдаются на ОГЭ, итоговая отметка — среднее арифметическое
 * годовой и экзаменационной отметок, округлённое по правилам математического округления;
 * по остальным предметам итоговая отметка равна годовой.
 *
 * Расчёт выполняется на устройстве пользователя, оценки на сервер не отправляются.
 */

export const MIN_GRADE = 2;
export const MAX_GRADE = 5;

/** Типовой набор предметов 9 класса. Пользователь может изменить список под свой аттестат. */
export const DEFAULT_SUBJECTS = Object.freeze([
  { id: 'russian', title: 'Русский язык', exam: 'required' },
  { id: 'literature', title: 'Литература' },
  { id: 'foreign', title: 'Иностранный язык' },
  { id: 'math', title: 'Математика', exam: 'required' },
  { id: 'informatics', title: 'Информатика' },
  { id: 'history', title: 'История' },
  { id: 'social', title: 'Обществознание' },
  { id: 'geography', title: 'География' },
  { id: 'physics', title: 'Физика' },
  { id: 'chemistry', title: 'Химия' },
  { id: 'biology', title: 'Биология' },
  { id: 'technology', title: 'Труд (технология)' },
  { id: 'safety', title: 'Основы безопасности и защиты Родины' },
  { id: 'pe', title: 'Физическая культура' },
  { id: 'music', title: 'Музыка', finishedEarlier: true },
  { id: 'art', title: 'Изобразительное искусство', finishedEarlier: true },
].map((subject) => Object.freeze(subject)));

/** Предметы, которые можно выбрать на ОГЭ в регионах без эксперимента с двумя экзаменами. */
export const ELECTIVE_EXAM_SUBJECT_IDS = Object.freeze([
  'literature', 'foreign', 'informatics', 'history', 'social',
  'geography', 'physics', 'chemistry', 'biology',
]);

export const MAX_ELECTIVE_EXAMS = 2;

export function isValidGrade(value) {
  return Number.isInteger(value) && value >= MIN_GRADE && value <= MAX_GRADE;
}

/** Математическое округление итоговой отметки: 3,5 → 4; 4,5 → 5. */
export function roundFinalGrade(value) {
  return Math.floor(value + 0.5);
}

/**
 * Итоговая отметка по одному предмету.
 * @returns {{ grade: number|null, awaitingExam: boolean }}
 */
export function finalGrade({ annual, exam, takesExam }) {
  if (!isValidGrade(annual)) {
    return { grade: null, awaitingExam: false };
  }
  if (!takesExam) {
    return { grade: annual, awaitingExam: false };
  }
  if (!isValidGrade(exam)) {
    return { grade: annual, awaitingExam: true };
  }
  return { grade: roundFinalGrade((annual + exam) / 2), awaitingExam: false };
}

/**
 * Считает средний балл и подсказки, где оценку ещё можно улучшить.
 *
 * @param {Array<{ id: string, title: string, annual?: number|null, exam?: number|null,
 *   takesExam?: boolean, finishedEarlier?: boolean }>} subjects
 */
export function calculateAttestat(subjects) {
  const rows = subjects.map((subject) => {
    const { grade, awaitingExam } = finalGrade(subject);
    return { ...subject, final: grade, awaitingExam };
  });

  const graded = rows.filter((row) => row.final !== null);
  const count = graded.length;
  const sum = graded.reduce((total, row) => total + row.final, 0);
  const average = count > 0 ? sum / count : null;

  const influenceable = graded
    .filter((row) => !row.finishedEarlier && row.final < MAX_GRADE)
    .map((row) => ({
      id: row.id,
      title: row.title,
      current: row.final,
      deltaIfPlusOne: roundTo(1 / count, 3),
    }));

  const potentialSum = graded.reduce(
    (total, row) => total + (row.finishedEarlier ? row.final : Math.min(MAX_GRADE, row.final + 1)),
    0,
  );

  const warnings = [];
  if (graded.some((row) => row.final === MIN_GRADE)) {
    warnings.push('unsatisfactory');
  }
  if (rows.some((row) => row.awaitingExam)) {
    warnings.push('awaiting_exam');
  }
  if (count < subjects.length) {
    warnings.push('incomplete');
  }

  return {
    average: average === null ? null : roundTo(average, 2),
    gradedCount: count,
    totalCount: subjects.length,
    awaitingExamCount: rows.filter((row) => row.awaitingExam).length,
    influenceable,
    potentialAverage: count > 0 ? roundTo(potentialSum / count, 2) : null,
    rows: rows.map(({ id, title, final, awaitingExam }) => ({ id, title, final, awaitingExam })),
    warnings,
  };
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
