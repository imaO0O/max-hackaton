const idParam = { type: 'string', pattern: '^[a-z0-9-]{1,100}$' };
const programIdParam = { type: 'string', pattern: '^[a-z0-9_-]{1,160}$' };

import { EVENTS } from '../../services/analytics.js';

export function registerCatalogRoutes(api, { catalog, analytics }) {
  api.get('/regions', async () => ({ regions: catalog.listRegions() }));

  api.get('/regions/:regionId/cities', {
    schema: { params: { type: 'object', properties: { regionId: idParam }, required: ['regionId'] } },
  }, async (request) => ({ cities: catalog.listCities(request.params.regionId) }));

  api.get('/interests', async () => ({ interests: catalog.listInterests() }));

  api.get('/specialties', {
    schema: {
      querystring: {
        type: 'object',
        properties: { interestId: idParam },
        additionalProperties: false,
      },
    },
  }, async (request) => ({ specialties: catalog.listSpecialties(request.query.interestId) }));

  api.get('/content', async () => catalog.getContent());

  api.get('/colleges', {
    schema: {
      querystring: {
        type: 'object',
        required: ['regionId'],
        additionalProperties: false,
        properties: {
          regionId: idParam,
          city: { type: 'string', minLength: 1, maxLength: 100 },
          interests: { type: 'string', pattern: '^[a-z0-9-]+(,[a-z0-9-]+)*$' },
          specialty: { type: 'string', pattern: '^\\d{2}\\.\\d{2}\\.\\d{2}$' },
          form: { type: 'string', enum: ['full_time', 'part_time', 'extramural'] },
          budgetOnly: { type: 'boolean', default: false },
        },
      },
    },
  }, async (request) => {
    const { regionId, city, interests, specialty, form, budgetOnly } = request.query;
    const colleges = catalog.searchColleges({
      regionId,
      city,
      interestIds: interests ? interests.split(',') : [],
      specialtyCode: specialty,
      form,
      budgetOnly,
    });
    return { colleges };
  });

  api.get('/colleges/:collegeId', {
    schema: { params: { type: 'object', properties: { collegeId: idParam }, required: ['collegeId'] } },
  }, async (request) => ({ college: catalog.getCollege(request.params.collegeId) }));

  api.get('/favorites', { config: { auth: true } }, async (request) => ({
    favorites: catalog.listFavorites(request.maxUser.id),
  }));

  api.put('/favorites/:programId', {
    config: { auth: true },
    schema: { params: { type: 'object', properties: { programId: programIdParam }, required: ['programId'] } },
  }, async (request) => {
    const result = catalog.addFavorite(request.maxUser.id, request.params.programId);
    analytics.track(EVENTS.FAVORITE_ADDED, request.maxUser.id, { programId: result.programId });
    return result;
  });

  api.delete('/favorites/:programId', {
    config: { auth: true },
    schema: { params: { type: 'object', properties: { programId: programIdParam }, required: ['programId'] } },
  }, async (request) => catalog.removeFavorite(request.maxUser.id, request.params.programId));
}
