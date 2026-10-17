import { Keyboard } from '@maxhub/max-bot-api';
import {
  QUIZ_PHASES, QUIZ_QUESTIONS, QUIZ_ROLES, quizResult,
} from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';

/**
 * Проверка понимания правил: три вопроса до сценария и те же после.
 * «До» — пока семья ещё не видела план (предлагается в начале опроса и подростку по ссылке),
 * «после» — когда план уже есть (меню, /quiz). Ответы «до» не раскрываются, чтобы не подсказать.
 * Payload: qz:go:<p|t> — начать; qz:<b|a>:<p|t>:<вопрос>:<вариант>:<маска верных> — ответ.
 */

const button = Keyboard.button;
const PHASE_CODES = { b: QUIZ_PHASES.BEFORE, a: QUIZ_PHASES.AFTER };
const ROLE_CODES = { p: QUIZ_ROLES.PARENT, t: QUIZ_ROLES.TEEN };

export function registerQuizChat({
  bot, users, services, onBeforeDone,
}) {
  const userIdOf = (ctx) => ctx.user?.user_id;
  const payloadOf = (ctx) => ctx.callback?.payload ?? '';

  /** План уже видели: свой план есть или семья поделилась своим. */
  function hasSeenPlan(userId) {
    return isProfileComplete(users.ensure(userId)) || Boolean(services.plan.getFollowedShareToken(userId));
  }

  /** «До» — только пока нет ни ответа «до», ни плана; иначе — «после». */
  function phaseFor(userId) {
    return !services.analytics.hasQuizBefore(userId) && !hasSeenPlan(userId) ? 'b' : 'a';
  }

  /** Предлагать ли вопросы в начале опроса. */
  function shouldOfferBefore(userId) {
    return phaseFor(userId) === 'b';
  }

  function questionView(phase, role, index, mask) {
    const question = QUIZ_QUESTIONS[index];
    const intro = phase === 'b' && index === 0
      ? 'Три коротких вопроса о правилах — до плана. Ответы не оцениваются, в конце покажем, что изменилось.\n\n'
      : '';
    return {
      text: `${intro}Вопрос ${index + 1} из ${QUIZ_QUESTIONS.length}\n\n${question.text}`,
      keyboard: Keyboard.inlineKeyboard(question.options.map((option, optionIndex) => [
        button.callback(option, `qz:${phase}:${role}:${index}:${optionIndex}:${mask}`),
      ])),
    };
  }

  const show = (ctx, view) => ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } });

  /** Итог «после»: результат, сравнение с «до» и разбор каждого вопроса. */
  function afterResultView(userId, result) {
    const before = services.analytics.lastQuiz(userId, QUIZ_PHASES.BEFORE);
    const lines = [
      `Ваш результат: ${result.score} из ${result.total}${before ? ` (до плана — ${before.score} из ${before.total})` : ''}.`,
      '',
      ...QUIZ_QUESTIONS.map((question) => `${result.answers[question.id] ? '✅' : '❌'} ${question.explanation}`),
    ];
    return {
      text: lines.join('\n'),
      keyboard: Keyboard.inlineKeyboard([[button.callback('← Меню', 'menu:show')]]),
    };
  }

  async function finish(ctx, phaseCode, roleCode, mask) {
    const userId = userIdOf(ctx);
    const result = quizResult(mask);
    const phase = PHASE_CODES[phaseCode];
    services.analytics.track(EVENTS.QUIZ_COMPLETED, userId, {
      phase, role: ROLE_CODES[roleCode], score: result.score, answers: result.answers,
    });
    if (phase === QUIZ_PHASES.BEFORE) {
      if (roleCode === 'p') return onBeforeDone(ctx);
      return show(ctx, {
        text: 'Спасибо! Посмотрите план семьи и ответьте ещё раз — кнопка «🧠 Проверить себя» в меню. Тогда сравним.',
        keyboard: Keyboard.inlineKeyboard([[button.callback('☰ Меню', 'menu:show')]]),
      });
    }
    return show(ctx, afterResultView(userId, result));
  }

  // Начать: фаза определяется сама
  bot.action(/^qz:go:[pt]$/, (ctx) => {
    const role = payloadOf(ctx).slice('qz:go:'.length);
    return show(ctx, questionView(phaseFor(userIdOf(ctx)), role, 0, 0));
  });

  bot.action(/^qz:[ba]:[pt]:\d:\d:\d+$/, (ctx) => {
    const [, phase, role, questionIndex, optionIndex, maskText] = payloadOf(ctx).split(':');
    const index = Number(questionIndex);
    const question = QUIZ_QUESTIONS[index];
    if (!question) return show(ctx, { text: 'Вопрос устарел.', keyboard: Keyboard.inlineKeyboard([[button.callback('☰ Меню', 'menu:show')]]) });
    const mask = Number(maskText) | (Number(optionIndex) === question.correct ? 1 << index : 0);
    if (index + 1 < QUIZ_QUESTIONS.length) return show(ctx, questionView(phase, role, index + 1, mask));
    return finish(ctx, phase, role, mask);
  });

  /** /quiz — для родителя или подписчика; фаза определяется сама. */
  async function sendQuiz(ctx) {
    const userId = userIdOf(ctx);
    const user = users.ensure(userId);
    const role = !isProfileComplete(user) && services.plan.getFollowedShareToken(userId) ? 't' : 'p';
    const view = questionView(phaseFor(userId), role, 0, 0);
    return ctx.reply(view.text, { attachments: [view.keyboard] });
  }

  /** Шаг перед опросом: предложить вопросы «до» или пропустить. */
  function offerView() {
    return {
      text: 'Перед планом — три коротких вопроса о правилах (полминуты). В конце можно ответить ещё раз и увидеть, что изменилось.',
      keyboard: Keyboard.inlineKeyboard([
        [button.callback('Ответить на 3 вопроса', 'qz:go:p')],
        [button.callback('Пропустить', 'survey:begin')],
      ]),
    };
  }

  return { sendQuiz, offerView, shouldOfferBefore };
}
