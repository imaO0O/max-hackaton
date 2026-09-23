import crypto from 'node:crypto';

/**
 * Календарь плана в формате iCalendar (RFC 5545): даты становятся событиями на весь день,
 * у каждого события напоминание накануне в 9:00. Файл открывается стандартным календарём телефона.
 */

const LINK_TTL_SECONDS = 10 * 60;

/** Экранирование текстовых значений iCalendar: \ ; , и переводы строк. */
export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Перенос длинных строк: не больше 75 октетов, продолжение начинается с пробела. Кириллица не разрывается. */
export function foldIcsLine(line) {
  const parts = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, 'utf8');
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const icsDate = (date) => date.replaceAll('-', '');

function nextDay(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {object} params
 * @param {Array<object>} params.items пункты плана
 * @param {string} params.calendarName
 * @param {string} params.uidSuffix стабильная часть UID, чтобы повторный импорт обновлял события
 * @param {Date} [params.now]
 */
export function buildIcs({ items, calendarName, uidSuffix, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//posle9//plan//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const item of items) {
    const description = [
      item.isApproximate ? 'Дата ориентировочная.' : null,
      item.description,
      item.sourceUrl ? `Источник: ${item.sourceUrl}` : null,
    ].filter(Boolean).join('\n\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}-${uidSuffix}@posle9`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(item.dateStart)}`,
      // В iCalendar конец события на весь день не включается в событие — берём следующий день
      `DTEND;VALUE=DATE:${icsDate(nextDay(item.dateEnd ?? item.dateStart))}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(item.title)}`,
      'TRIGGER:-PT15H',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/**
 * Одноразовая ссылка на файл календаря. WebApp.downloadFile скачивает файл без заголовков авторизации,
 * поэтому доступ подтверждается подписью в самой ссылке, которая действует 10 минут.
 */
export function createCalendarLinks({ secret, clock = () => new Date() }) {
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 32);

  return {
    ttlSeconds: LINK_TTL_SECONDS,

    issue(userId) {
      const expires = Math.floor(clock().getTime() / 1000) + LINK_TTL_SECONDS;
      const payload = `${userId}.${expires}`;
      return `${payload}.${sign(payload)}`;
    },

    /** @returns {number|null} ID пользователя, если ссылка подлинная и не истекла */
    verify(token) {
      const match = /^(\d{1,20})\.(\d{10})\.([A-Za-z0-9_-]{32})$/.exec(token ?? '');
      if (!match) return null;
      const [, userId, expires, signature] = match;
      const expected = sign(`${userId}.${expires}`);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
      if (Number(expires) < Math.floor(clock().getTime() / 1000)) return null;
      return Number(userId);
    },
  };
}

/** Секрет подписи ссылок выводится из токена бота; без токена (локальная разработка) — случайный на время процесса. */
export function calendarSecret(botToken) {
  return botToken
    ? crypto.createHmac('sha256', 'posle9-calendar-link').update(botToken).digest()
    : crypto.randomBytes(32);
}

/** Сценарий «Добавить даты в календарь»: выдать одноразовую ссылку и отдать по ней файл. */
export function createCalendarService({ plan, links }) {
  const fileNameFor = (academicYear) => `posle9-plan-${academicYear.replace('/', '-')}.ics`;

  return {
    createLink(userId, baseUrl) {
      const current = plan.getPlan(userId);
      const fileName = fileNameFor(current.academicYear);
      return {
        url: `${baseUrl}/api/calendar/${links.issue(userId)}.ics`,
        fileName,
        expiresInSeconds: links.ttlSeconds,
        eventsCount: current.items.filter((item) => item.status !== 'past').length,
      };
    },

    /** @returns {{ fileName: string, ics: string } | null} null — ссылка недействительна или истекла */
    getFile(token) {
      const userId = links.verify(token);
      if (userId === null) return null;
      const current = plan.getPlan(userId);
      return {
        fileName: fileNameFor(current.academicYear),
        ics: buildIcs({
          items: current.items.filter((item) => item.status !== 'past'),
          calendarName: `После 9-го: план ${current.academicYear}`,
          uidSuffix: crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 12),
        }),
      };
    },
  };
}
