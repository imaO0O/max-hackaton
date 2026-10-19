import {
  WEEK_STEP_RESULTS, weekStepById, weekStepCheckAt, weekStepOptions,
} from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from './analytics.js';
import { badRequest, conflict, notFound } from './errors.js';

/**
 * Шаг на эту неделю — общая логика для бота и мини-приложения.
 * Семья выбирает одно действие из двух-трёх, через 5 дней бот спрашивает «Получилось?».
 * В метрики пишутся события «предложили», «выбрали» и «ответили»; в таблице — только состояние для вопроса.
 */
export function createWeekStepService({ repos, analytics, clock = () => new Date() }) {
  const {
    users, reference, weekSteps, events,
  } = repos;

  function optionsFor(userId) {
    const user = users.ensure(userId);
    if (!isProfileComplete(user)) return [];
    const region = reference.getRegion(user.regionId);
    return weekStepOptions({ grade: user.grade, path: user.path, twoOgeExperiment: Boolean(region?.twoOgeExperiment) });
  }

  function currentOf(row) {
    const step = row && weekStepById(row.stepId);
    if (!step) return null;
    return {
      id: row.id,
      stepId: step.id,
      title: step.title,
      hint: step.hint,
      status: row.status,
      chosenAt: row.chosenAt,
      checkAt: row.checkAt,
    };
  }

  /** Варианты для семьи и последний выбранный шаг. */
  function view(userId) {
    return {
      options: optionsFor(userId).map(({ id, button, title }) => ({ id, button, title })),
      current: currentOf(weekSteps.latest(userId)),
    };
  }

  return {
    view,
    optionsFor,

    /** Предложили выбрать шаг — один раз на семью, чтобы считать долю выбравших. */
    offer(userId, { from } = {}) {
      if (weekSteps.latest(userId) || events.hasUser(EVENTS.WEEK_STEP_OFFERED, userId)) return;
      analytics.track(EVENTS.WEEK_STEP_OFFERED, userId, { from });
    },

    /** Выбрать шаг. Если шаг этой недели уже выбран и вопрос ещё не задан — заменить его. */
    choose(userId, stepId, { from } = {}) {
      const options = optionsFor(userId);
      if (!options.length) throw conflict('profile_incomplete', 'Сначала ответьте на вопросы о регионе, классе и пути');
      if (!options.some((option) => option.id === stepId)) throw badRequest('Такого шага нет в плане семьи');
      const latest = weekSteps.latest(userId);
      if (latest?.status === 'chosen' && !latest.checkSentAt) {
        weekSteps.setStep(latest.id, stepId);
        return view(userId);
      }
      const now = clock();
      const region = reference.getRegion(users.ensure(userId).regionId);
      const created = weekSteps.create({
        userId, stepId, chosenAt: now.toISOString(), checkAt: weekStepCheckAt(now, region?.utcOffsetHours ?? 3),
      });
      analytics.track(EVENTS.WEEK_STEP_CHOSEN, userId, { weekStepId: created.id, stepId, from });
      return view(userId);
    },

    /** «Сделано» или «Ещё нет». После «Ещё нет» можно ответить «Сделано»; повторный ответ ничего не меняет. */
    answer(userId, weekStepId, result, { from } = {}) {
      if (!Object.values(WEEK_STEP_RESULTS).includes(result)) throw badRequest('Ответ — done или not_yet');
      const row = weekSteps.get(weekStepId);
      if (!row || row.userId !== userId) throw notFound('Шаг не найден');
      const step = weekStepById(row.stepId);
      if (row.status === WEEK_STEP_RESULTS.DONE || row.status === result) return { ...view(userId), step, changed: false };
      weekSteps.answer(row.id, result, clock().toISOString());
      analytics.track(EVENTS.WEEK_STEP_ANSWERED, userId, {
        weekStepId: row.id, stepId: row.stepId, result, from,
      });
      return { ...view(userId), step, changed: true };
    },

    /** Шаги, по которым пора спросить «Получилось?». */
    dueChecks(now = clock()) {
      return weekSteps.listDueChecks(now).map((row) => ({ ...row, step: weekStepById(row.stepId) }));
    },

    markCheckSent(id) {
      weekSteps.markCheckSent(id, clock().toISOString());
    },
  };
}
