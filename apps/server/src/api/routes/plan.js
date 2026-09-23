import { GRADE_VALUES, PATH_VALUES } from '@posle9/core';

import { EVENTS, launchSource } from '../../services/analytics.js';

const tokenParam = { type: 'string', pattern: '^[A-Za-z0-9_-]{16,64}$' };

export function registerPlanRoutes(api, { plan, analytics }) {
  /** Кто открыл мини-приложение и с каким параметром запуска (например, ссылка на чужой план). */
  api.get('/session', { config: { auth: true } }, async (request) => {
    const profile = plan.getProfile(request.maxUser.id);
    analytics.track(EVENTS.MINIAPP_OPENED, request.maxUser.id, { source: launchSource(request.startParam) });
    return { userId: request.maxUser.id, startParam: request.startParam, profile };
  });

  api.get('/profile', { config: { auth: true } }, async (request) => ({
    profile: plan.getProfile(request.maxUser.id),
  }));

  api.put('/profile', {
    config: { auth: true },
    schema: {
      body: {
        type: 'object',
        required: ['regionId', 'grade', 'path'],
        additionalProperties: false,
        properties: {
          regionId: { type: 'string', pattern: '^[a-z0-9-]{1,100}$' },
          city: { type: ['string', 'null'], maxLength: 100 },
          grade: { type: 'integer', enum: GRADE_VALUES },
          path: { type: 'string', enum: PATH_VALUES },
          interests: { type: 'array', maxItems: 20, items: { type: 'string', pattern: '^[a-z0-9-]{1,50}$' } },
          remindersEnabled: { type: 'boolean' },
        },
      },
    },
  }, async (request) => ({ profile: plan.saveProfile(request.maxUser.id, request.body) }));

  api.put('/profile/reminders', {
    config: { auth: true },
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        additionalProperties: false,
        properties: { enabled: { type: 'boolean' } },
      },
    },
  }, async (request) => ({ profile: plan.setRemindersEnabled(request.maxUser.id, request.body.enabled) }));

  api.get('/plan', { config: { auth: true } }, async (request) => plan.getPlan(request.maxUser.id));

  api.put('/plan/items/:itemId', {
    config: { auth: true },
    schema: {
      params: {
        type: 'object',
        required: ['itemId'],
        properties: { itemId: { type: 'string', pattern: '^[a-z0-9-]{1,100}$' } },
      },
      body: {
        type: 'object',
        required: ['done'],
        additionalProperties: false,
        properties: { done: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    const result = plan.setItemDone(request.maxUser.id, request.params.itemId, request.body.done);
    if (result.done) analytics.track(EVENTS.ITEM_DONE, request.maxUser.id, { itemId: result.id });
    return result;
  });

  api.post('/plan/share', { config: { auth: true } }, async (request) => plan.createShareLink(request.maxUser.id));

  api.get('/shared-plans/:token', {
    config: { auth: true },
    schema: { params: { type: 'object', required: ['token'], properties: { token: tokenParam } } },
  }, async (request) => {
    const shared = plan.getSharedPlan(request.maxUser.id, request.params.token);
    if (!shared.isOwner) analytics.track(EVENTS.SHARED_PLAN_OPENED, request.maxUser.id);
    return shared;
  });

  api.put('/shared-plans/:token/follow', {
    config: { auth: true },
    schema: {
      params: { type: 'object', required: ['token'], properties: { token: tokenParam } },
      body: {
        type: 'object',
        required: ['follow'],
        additionalProperties: false,
        properties: { follow: { type: 'boolean' } },
      },
    },
  }, async (request) => {
    const result = plan.setFollowing(request.maxUser.id, request.params.token, request.body.follow);
    if (result.isFollowing) analytics.track(EVENTS.FOLLOW_STARTED, request.maxUser.id);
    return result;
  });
}
