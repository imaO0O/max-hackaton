/**
 * Короткая проверка понимания правил: три вопроса до сценария и те же после.
 * Сравнение «до» и «после» показывает, помог ли план, а не только то, что его открыли.
 * В метрики попадает только верно или неверно по каждому вопросу — без ответов в свободной форме.
 *
 * Источники: Порядок ГИА-9 (заявление до 1 марта), 40-ФЗ и перечень региона (два ОГЭ → только колледж),
 * Порядок приёма в СПО (заявления в несколько колледжей, оригинал аттестата для зачисления — в один).
 */

export const QUIZ_QUESTIONS = Object.freeze([
  {
    id: 'deadline',
    title: 'срок заявления на ОГЭ',
    text: 'До какой даты девятиклассник подаёт заявление на ОГЭ с выбором предметов?',
    options: ['До 1 марта', 'До 1 мая', 'В день экзамена'],
    correct: 0,
    explanation: 'Заявление на ОГЭ с выбором предметов подают до 1 марта включительно.',
  },
  {
    id: 'two_oge',
    title: 'два ОГЭ и 10 класс',
    text: 'В регионе эксперимента подросток сдал только два ОГЭ — русский язык и математику. Можно ли с таким аттестатом пойти в 10 класс?',
    // Подписи кнопок короткие — длинные обрезаются на телефоне
    options: ['Да, в любой 10 класс', 'Да, если оценки хорошие', 'Нет, только в колледж из перечня'],
    correct: 2,
    explanation: 'С аттестатом по двум ОГЭ поступают только в колледж на профессии из перечня региона; для 10 класса нужны четыре экзамена.',
  },
  {
    id: 'colleges',
    title: 'подача в несколько колледжей',
    text: 'В сколько колледжей можно подать документы?',
    options: ['Только в один', 'В несколько, оригинал — в один', 'Не больше чем в три'],
    correct: 1,
    explanation: 'Заявления можно подать в несколько колледжей; оригинал аттестата для зачисления отдают в тот, куда решили поступать.',
  },
].map((question) => Object.freeze(question)));

export const QUIZ_PHASES = Object.freeze({ BEFORE: 'before', AFTER: 'after' });
export const QUIZ_ROLES = Object.freeze({ PARENT: 'parent', TEEN: 'teen' });

/** Битовая маска верных ответов → { deadline: true, two_oge: false, … } и число верных. */
export function quizResult(mask) {
  const answers = Object.fromEntries(QUIZ_QUESTIONS.map((question, index) => [question.id, Boolean(mask & (1 << index))]));
  return { answers, score: Object.values(answers).filter(Boolean).length, total: QUIZ_QUESTIONS.length };
}

/**
 * Сводка для метрик: доля верных ответов до и после и сдвиг у тех, кто ответил оба раза.
 * Берётся первая попытка в каждой фазе: после первой «после» бот показывает разбор, повтор уже не измеряет план.
 * @param {Array<{ userId: number, phase: string, score: number, answers: object }>} attempts попытки в порядке времени
 */
export function summarizeQuiz(attempts) {
  const first = { before: new Map(), after: new Map() };
  for (const attempt of attempts) {
    if (first[attempt.phase] && !first[attempt.phase].has(attempt.userId)) first[attempt.phase].set(attempt.userId, attempt);
  }
  const share = (map) => {
    const list = [...map.values()];
    const correct = list.reduce((sum, attempt) => sum + attempt.score, 0);
    return { people: list.length, percent: list.length ? Math.round((correct / (list.length * QUIZ_QUESTIONS.length)) * 100) : null };
  };
  const byQuestion = QUIZ_QUESTIONS.map((question) => {
    const percent = (map) => {
      const list = [...map.values()];
      return list.length ? Math.round((list.filter((attempt) => attempt.answers?.[question.id]).length / list.length) * 100) : null;
    };
    return { id: question.id, title: question.title, before: percent(first.before), after: percent(first.after) };
  });
  const paired = [...first.before.keys()].filter((userId) => first.after.has(userId));
  const average = (phase) => (paired.length
    ? paired.reduce((sum, userId) => sum + first[phase].get(userId).score, 0) / paired.length
    : null);
  return {
    before: share(first.before),
    after: share(first.after),
    paired: { people: paired.length, before: average('before'), after: average('after') },
    byQuestion,
  };
}
