import {
  QUIZ_PHASES, QUIZ_QUESTIONS, QUIZ_ROLES, quizResult,
} from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from './analytics.js';

/**
 * Проверка понимания правил — общая логика для бота и мини-приложения.
 * «До» — пока у пользователя нет ни ответов «до», ни плана (своего или плана семьи); иначе — «после».
 * Ответы проверяет сервер: в метрики пишется только «верно или неверно» по каждому вопросу.
 */
export function createQuizService({ repos, plan, analytics }) {
  const { users } = repos;

  /** План уже видели: свой план есть или семья поделилась своим. */
  function hasSeenPlan(userId) {
    return isProfileComplete(users.ensure(userId)) || Boolean(plan.getFollowedShareToken(userId));
  }

  function phaseFor(userId) {
    return !analytics.hasQuizBefore(userId) && !hasSeenPlan(userId) ? QUIZ_PHASES.BEFORE : QUIZ_PHASES.AFTER;
  }

  /** Подросток — тот, кто смотрит план семьи и своего плана не собирал. */
  function roleFor(userId) {
    return !isProfileComplete(users.ensure(userId)) && plan.getFollowedShareToken(userId) ? QUIZ_ROLES.TEEN : QUIZ_ROLES.PARENT;
  }

  /** Сохранить попытку: маска верных ответов → результат и, для «после», результат «до» для сравнения. */
  function record(userId, mask, { phase = phaseFor(userId), role = roleFor(userId), from } = {}) {
    const result = quizResult(mask);
    const before = phase === QUIZ_PHASES.AFTER ? analytics.lastQuiz(userId, QUIZ_PHASES.BEFORE) : null;
    analytics.track(EVENTS.QUIZ_COMPLETED, userId, {
      phase, role, score: result.score, answers: result.answers, from,
    });
    return { phase, ...result, before };
  }

  return {
    phaseFor,
    roleFor,
    record,

    /** Что показать пользователю: «до» или «после» и прежний результат «до». */
    status(userId) {
      return { phase: phaseFor(userId), before: analytics.lastQuiz(userId, QUIZ_PHASES.BEFORE) };
    },

    /** Ответы из мини-приложения: { deadline: 0, two_oge: 2, colleges: 1 } — номера выбранных вариантов. */
    submit(userId, chosen, { from } = {}) {
      const mask = QUIZ_QUESTIONS.reduce((sum, question, index) => (chosen[question.id] === question.correct ? sum | (1 << index) : sum), 0);
      return record(userId, mask, { from });
    },

    /** Вопросы «до» пропустили — чтобы понимать, насколько сравнение «до → после» выборочное. */
    skip(userId, { from } = {}) {
      analytics.track(EVENTS.QUIZ_SKIPPED, userId, { from });
    },
  };
}
