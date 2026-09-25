import { EVENTS } from '../../services/analytics.js';
import { AppError } from '../../services/errors.js';

export function registerCalendarRoutes(api, { calendar, analytics }) {
  /**
   * Одноразовая ссылка на файл .ics с датами плана. Мини-приложение передаёт её в WebApp.downloadFile:
   * нативный клиент MAX скачивает файл без заголовков авторизации, поэтому ссылка подписана и живёт 10 минут.
   */
  api.post('/plan/calendar-link', { config: { auth: true } }, async (request) => {
    const baseUrl = `${request.protocol}://${request.host}`;
    return calendar.createLink(request.maxUser.id, baseUrl);
  });

  api.get('/calendar/:file', {
    schema: {
      params: {
        type: 'object',
        required: ['file'],
        properties: { file: { type: 'string', pattern: '^[0-9.A-Za-z_-]{1,120}\\.ics$' } },
      },
    },
  }, async (request, reply) => {
    const token = request.params.file.slice(0, -'.ics'.length);
    const file = calendar.getFile(token);
    if (!file) {
      throw new AppError(410, 'link_expired', 'Ссылка на календарь устарела. Нажмите «Добавить в календарь» ещё раз');
    }
    analytics.track(EVENTS.CALENDAR_DOWNLOADED, file.userId);
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
      .header('Cache-Control', 'no-store')
      .send(file.ics);
  });
}
