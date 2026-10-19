/**
 * Шаг на эту неделю: после плана семья выбирает одно конкретное действие,
 * через WEEK_STEP_CHECK_DAYS дней сервис спрашивает «Получилось?».
 * Нужен, потому что ближайшие сроки плана (заявление на ОГЭ до 1 марта) далеко,
 * а метрика выполненного шага должна показывать действие уже в первую неделю.
 */

import { REMINDER_HOUR, localDateString, sendAtUtc } from './plan.js';

export const WEEK_STEP_CHECK_DAYS = 5;

/** Семья, ответившая «Сделано» не позже этого срока после выбора, выполнила шаг «за неделю». */
export const WEEK_STEP_WINDOW_DAYS = 7;

export const WEEK_STEP_RESULTS = Object.freeze({ DONE: 'done', NOT_YET: 'not_yet' });

const STEPS = {
  teacher_two_oge: {
    button: '👩‍🏫 Спросить про 2 или 4 ОГЭ',
    title: 'Спросить классного руководителя: 2 или 4 ОГЭ и какие предметы',
    hint: 'Что спросить: будет ли школа предлагать два ОГЭ по новым правилам, какие колледжи и специальности в перечне региона и когда собирают заявления — подать его нужно до 1 марта.',
  },
  teacher_oge: {
    button: '👩‍🏫 Спросить про предметы ОГЭ',
    title: 'Спросить классного руководителя, какие предметы ОГЭ выбрать',
    hint: 'Что спросить: какие предметы по выбору чаще сдают в классе, какие нужны для профиля 10 класса или колледжа и когда собирают заявления — подать его нужно до 1 марта.',
  },
  open_day: {
    button: '🏫 День открытых дверей',
    title: 'Записаться на день открытых дверей колледжа',
    hint: 'Даты дней открытых дверей публикуют на сайтах колледжей. Начните с колледжей, которые подходят по интересам подростка.',
  },
  profile_class: {
    button: '🏫 Профили 10 класса',
    title: 'Узнать в школе, какие профили 10 класса будут',
    hint: 'Спросите у классного руководителя или завуча, какие профили откроют и какие ОГЭ по выбору для них нужны.',
  },
  interests: {
    button: '💬 Обсудить сферы с подростком',
    title: 'Обсудить с подростком 2–3 интересные сферы',
    hint: 'Начните с того, что подростку нравится делать, а не с профессий. От сфер зависят колледжи и профиль в плане — их можно поменять в ответах.',
  },
};

/** Шаг по id или null, если такого шага нет. */
export function weekStepById(id) {
  return Object.hasOwn(STEPS, id) ? { id, ...STEPS[id] } : null;
}

/**
 * Два-три шага, подходящих семье: вопрос про ОГЭ — только 9 классу, колледж или профиль 10 класса — по пути.
 * @param {{ grade: number, path: string, twoOgeExperiment?: boolean }} profile
 */
export function weekStepOptions({ grade, path, twoOgeExperiment = false }) {
  const ids = [];
  if (grade === 9) ids.push(twoOgeExperiment ? 'teacher_two_oge' : 'teacher_oge');
  ids.push(path === 'school10' ? 'profile_class' : 'open_day');
  ids.push('interests');
  return ids.map(weekStepById);
}

/** Когда спросить «Получилось?»: через WEEK_STEP_CHECK_DAYS дней в REMINDER_HOUR по времени региона, ISO UTC. */
export function weekStepCheckAt(chosenAt, utcOffsetHours = 3) {
  const localDate = localDateString(chosenAt, utcOffsetHours);
  return sendAtUtc(localDate, -WEEK_STEP_CHECK_DAYS, REMINDER_HOUR, utcOffsetHours).toISOString();
}

const MS_PER_DAY = 24 * 3600 * 1000;

/**
 * Сводка для метрик по первому выбранному шагу каждой семьи: выполнили за неделю, позже, «ещё нет», ждём ответа.
 * «Ещё нет», а потом «Сделано» — шаг выполнен. totalDone — все выполненные шаги, включая следующие недели.
 * @param {{ offered: number[], chosen: Array<{ userId: number, weekStepId: number, createdAt: string }>,
 *   answered: Array<{ weekStepId: number, result: string, createdAt: string }> }} events в порядке времени
 */
export function summarizeWeekSteps({ offered, chosen, answered }) {
  const first = new Map();
  for (const event of chosen) if (!first.has(event.userId)) first.set(event.userId, event);
  const doneAt = new Map();
  const notYet = new Set();
  for (const event of answered) {
    if (event.result === WEEK_STEP_RESULTS.DONE && !doneAt.has(event.weekStepId)) doneAt.set(event.weekStepId, event.createdAt);
    if (event.result === WEEK_STEP_RESULTS.NOT_YET) notYet.add(event.weekStepId);
  }
  const summary = {
    offered: new Set([...offered, ...first.keys()]).size,
    chosen: first.size,
    doneInWeek: 0,
    doneLater: 0,
    notYet: 0,
    waiting: 0,
    totalDone: doneAt.size,
  };
  for (const event of first.values()) {
    const done = doneAt.get(event.weekStepId);
    if (done) {
      const days = (Date.parse(done) - Date.parse(event.createdAt)) / MS_PER_DAY;
      if (days <= WEEK_STEP_WINDOW_DAYS) summary.doneInWeek += 1;
      else summary.doneLater += 1;
    } else if (notYet.has(event.weekStepId)) summary.notYet += 1;
    else summary.waiting += 1;
  }
  return summary;
}
