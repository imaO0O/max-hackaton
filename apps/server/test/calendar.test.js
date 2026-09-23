import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIcs, createCalendarLinks, escapeIcsText, foldIcsLine } from '../src/services/calendar.js';
import { authHeaders, createTestApp } from './helpers.js';

describe('формат iCalendar', () => {
  test('экранирование спецсимволов', () => {
    assert.equal(escapeIcsText('Пункт; с запятой, и \\ слешем\nи строкой'), 'Пункт\\; с запятой\\, и \\\\ слешем\\nи строкой');
  });

  test('длинные строки переносятся по 75 октетов, кириллица не разрывается', () => {
    const line = `SUMMARY:${'Приём документов в колледжи '.repeat(6)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    assert.ok(parts.length > 1);
    for (const part of parts) assert.ok(Buffer.byteLength(part, 'utf8') <= 75);
    assert.ok(parts.slice(1).every((part) => part.startsWith(' ')));
    assert.equal(parts.map((part, index) => (index ? part.slice(1) : part)).join(''), line);
  });

  test('события на весь день: конец периода — следующий день, напоминание накануне', () => {
    const ics = buildIcs({
      calendarName: 'План',
      uidSuffix: 'abc',
      now: new Date('2026-09-23T10:00:00Z'),
      items: [
        { id: 'one', title: 'Заявление на ОГЭ', description: 'До 1 марта', dateStart: '2027-03-01', dateEnd: null },
        { id: 'two', title: 'Приём документов', description: 'Период', dateStart: '2027-06-20', dateEnd: '2027-08-15', isApproximate: true, sourceUrl: 'https://example.ru' },
      ],
    });
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.match(ics, /DTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270302/);
    assert.match(ics, /DTSTART;VALUE=DATE:20270620\r\nDTEND;VALUE=DATE:20270816/);
    assert.match(ics, /UID:one-abc@posle9/);
    assert.match(ics, /DTSTAMP:20260923T100000Z/);
    assert.match(ics, /TRIGGER:-PT15H/);
    assert.match(ics.replace(/\r\n /g, ''), /Дата ориентировочная\.\\n\\nПериод\\n\\nИсточник: https:\/\/example\.ru/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  });
});

describe('одноразовые ссылки на календарь', () => {
  test('подлинная ссылка принимается, подделанная и истёкшая — нет', () => {
    const clock = { now: new Date('2026-09-23T10:00:00Z') };
    const links = createCalendarLinks({ secret: 'secret', clock: () => clock.now });
    const token = links.issue(42);
    assert.equal(links.verify(token), 42);
    assert.equal(links.verify(token.replace(/^42/, '43')), null, 'другой пользователь');
    assert.equal(links.verify('garbage'), null);
    assert.equal(createCalendarLinks({ secret: 'other' }).verify(token), null, 'чужой секрет');
    clock.now = new Date('2026-09-23T10:11:00Z');
    assert.equal(links.verify(token), null, 'ссылка живёт 10 минут');
  });
});

describe('API календаря', () => {
  let ctx;
  const USER = 7007;

  before(async () => {
    ctx = createTestApp();
    await ctx.app.ready();
    await ctx.app.inject({
      method: 'PUT', url: '/api/profile', headers: authHeaders(USER),
      payload: { regionId: 'demo-standard', grade: 9, path: 'college', interests: [] },
    });
  });

  after(async () => {
    await ctx.app.close();
    ctx.db.close();
  });

  test('ссылка выдаётся только из MAX и ведёт на файл плана', async () => {
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/plan/calendar-link' })).statusCode, 401);

    const response = await ctx.app.inject({
      method: 'POST', url: '/api/plan/calendar-link', headers: { ...authHeaders(USER), host: 'posle9.example.ru', 'x-forwarded-proto': 'https' },
    });
    assert.equal(response.statusCode, 200);
    const link = response.json();
    assert.match(link.url, /^https:\/\/posle9\.example\.ru\/api\/calendar\/7007\.\d{10}\.[A-Za-z0-9_-]{32}\.ics$/);
    assert.equal(link.fileName, 'posle9-plan-2026-2027.ics');
    assert.equal(link.expiresInSeconds, 600);
    assert.ok(link.eventsCount > 0);

    const file = await ctx.app.inject({ method: 'GET', url: new URL(link.url).pathname });
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-type'], /^text\/calendar/);
    assert.match(file.headers['content-disposition'], /attachment; filename="posle9-plan-2026-2027\.ics"/);
    assert.equal((file.body.match(/BEGIN:VEVENT/g) ?? []).length, link.eventsCount);
    assert.match(file.body, /X-WR-CALNAME:После 9-го: план 2026\/2027/);
  });

  test('недействительная ссылка — 410 с понятным текстом', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/calendar/7007.1700000000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.ics' });
    assert.equal(response.statusCode, 410);
    assert.equal(response.json().error.code, 'link_expired');
  });

  test('без заполненного профиля ссылку не получить', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/plan/calendar-link', headers: authHeaders(8008) });
    assert.equal(response.statusCode, 409);
  });
});
