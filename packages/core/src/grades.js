/**
 * Калькулятор среднего балла аттестата об основном общем образовании.
 *
 * Правило — Порядок заполнения, учёта и выдачи аттестатов (приказ Минпросвещения России
 * от 05.10.2020 № 546, ред. от 29.05.2026), сверено 16.09.2026:
 * - по русскому языку, математике и двум предметам по выбору, которые сдавались на ОГЭ,
 *   итоговая отметка — среднее арифметическое годовой и экзаменационной отметок,
 *   целым числом по правилам математического округления;
 * - если в учебном плане математика разделена на курсы «Алгебра», «Геометрия»
 *   и «Вероятность и статистика», итоговая отметка по математике — среднее арифметическое
 *   годовых отметок по этим курсам и экзаменационной отметки;
 * - по остальным предметам итоговая отметка выставляется на основе годовой.
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

/** Учебные курсы, из которых складывается итоговая отметка по математике. */
export const MATH_COURSES = Object.freeze([
  { id: 'algebra', title: 'Алгебра', shortTitle: 'Алгебра' },
  { id: 'geometry', title: 'Геометрия', shortTitle: 'Геометрия' },
  { id: 'probability', title: 'Вероятность и статистика', shortTitle: 'Вероятн.' },
].map((course) => Object.freeze(course)));

/** Предметы, которые можно выбрать для ОГЭ в дополнение к русскому языку и математике. */
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

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

/**
 * Итоговая отметка по одному предмету.
 * courses — годовые отметки по курсам предмета (алгебра, геометрия, вероятность и статистика).
 * Если courses задан, annual не используется, а отметка считается только когда заполнены все курсы.
 * @returns {{ grade: number|null, awaitingExam: boolean }}
 */
export function finalGrade({ annual, courses, exam, takesExam }) {
  const annualGrades = Array.isArray(courses) && courses.length > 0 ? courses : [annual];
  if (!annualGrades.every(isValidGrade)) {
    return { grade: null, awaitingExam: false };
  }
  const annualGrade = annualGrades.length === 1 ? annualGrades[0] : roundFinalGrade(mean(annualGrades));
  if (!takesExam) {
    return { grade: annualGrade, awaitingExam: false };
  }
  if (!isValidGrade(exam)) {
    return { grade: annualGrade, awaitingExam: true };
  }
  return { grade: roundFinalGrade(mean([...annualGrades, exam])), awaitingExam: false };
}

/**
 * Считает средний балл и подсказки, где оценку ещё можно улучшить.
 *
 * @param {Array<{ id: string, title: string, annual?: number|null, courses?: Array<number|null>,
 *   exam?: number|null, takesExam?: boolean, finishedEarlier?: boolean }>} subjects
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
