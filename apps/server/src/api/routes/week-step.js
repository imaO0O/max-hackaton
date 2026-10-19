import { WEEK_STEP_RESULTS } from '@posle9/core';

/** Шаг на эту неделю в мини-приложении: те же варианты и правила, что в чате (services.weekStep). */
export function registerWeekStepRoutes(api, { weekStep }) {
  api.get('/week-step', { config: { auth: true } }, async (request) => {
    const view = weekStep.view(request.maxUser.id);
    if (!view.current && view.options.length) weekStep.offer(request.maxUser.id, { from: 'miniapp' });
    return view;
  });

  api.post('/week-step', {
    config: { auth: true },
    schema: {
      body: {
        type: 'object',
        required: ['stepId'],
        additionalProperties: false,
        properties: { stepId: { type: 'string', maxLength: 40 } },
      },
    },
  }, async (request) => weekStep.choose(request.maxUser.id, request.body.stepId, { from: 'miniapp' }));

  api.post('/week-step/:id/answer', {
    config: { auth: true },
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      body: {
        type: 'object',
        required: ['result'],
        additionalProperties: false,
        properties: { result: { type: 'string', enum: Object.values(WEEK_STEP_RESULTS) } },
      },
    },
  }, async (request) => {
    const { step, ...view } = weekStep.answer(request.maxUser.id, request.params.id, request.body.result, { from: 'miniapp' });
    return view;
  });
}
