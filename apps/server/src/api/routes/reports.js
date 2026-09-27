import { REPORT_TARGETS } from '@posle9/core';

import { EVENTS } from '../../services/analytics.js';

/** «Сообщить о неточности»: программа колледжа или пункт плана и причина из списка. */
export function registerReportRoutes(api, { reports, analytics }) {
  api.post('/reports', {
    config: { auth: true },
    schema: {
      body: {
        type: 'object',
        required: ['targetType', 'targetId', 'reason'],
        additionalProperties: false,
        properties: {
          targetType: { type: 'string', enum: Object.values(REPORT_TARGETS) },
          targetId: { type: 'string', pattern: '^[a-z0-9_-]{1,160}$' },
          reason: { type: 'string', pattern: '^[a-z]{1,20}$' },
        },
      },
    },
  }, async (request, reply) => {
    const result = reports.create(request.maxUser.id, request.body);
    if (result.created) {
      analytics.track(EVENTS.DATA_REPORTED, request.maxUser.id, {
        targetType: request.body.targetType, reason: request.body.reason, from: 'miniapp',
      });
    }
    return reply.code(result.created ? 201 : 200).send(result);
  });
}
