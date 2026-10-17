import { QUIZ_QUESTIONS } from '@posle9/core';

/** Проверка понимания правил в мини-приложении: «до» или «после», ответы проверяет сервер. */
export function registerQuizRoutes(api, { quiz }) {
  api.get('/quiz', { config: { auth: true } }, async (request) => quiz.status(request.maxUser.id));

  api.post('/quiz', {
    config: { auth: true },
    schema: {
      body: {
        type: 'object',
        required: ['answers'],
        additionalProperties: false,
        properties: {
          answers: {
            type: 'object',
            additionalProperties: false,
            required: QUIZ_QUESTIONS.map((question) => question.id),
            properties: Object.fromEntries(QUIZ_QUESTIONS.map((question) => [
              question.id, { type: 'integer', minimum: 0, maximum: question.options.length - 1 },
            ])),
          },
        },
      },
    },
  }, async (request) => quiz.submit(request.maxUser.id, request.body.answers, { from: 'miniapp' }));

  api.post('/quiz/skip', { config: { auth: true } }, async (request) => {
    quiz.skip(request.maxUser.id, { from: 'miniapp' });
    return { ok: true };
  });
}
