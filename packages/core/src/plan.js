import { PATHS } from './constants.js';

/** Час по местному времени региона, в который отправляются напоминания. */
export const REMINDER_HOUR = 10;

/**
 * Учебный год вида «2026/2027». С августа план переключается на новый учебный год,
 * до августа показывается текущий — чтобы летом были видны сроки приёма в колледжи.
 */
export function academicYearFor(date = new Date()) {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 7 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

/** «2026/2027» → «2027/2028» */
export function nextAcademicYear(academicYear) {
  const [start] = academicYear.split('/').map(Number);
  return `${start + 1}/${start + 2}`;
}

/** «2027/2028» → «2026/2027» */
export function previousAcademicYear(academicYear) {
  const [start] = academicYear.split('/').map(Number);
  return `${start - 1}/${start}`;
}

/**
 * Подпись периода плана: у девятиклассника — учебный год, у восьмиклассника — два года,
 * потому что в план входят шаги 8 класса и даты 9 класса.
 */
export function planPeriodLabel({ academicYear, isAdvance }) {
  if (!isAdvance) return academicYear;
  const [, end] = academicYear.split('/');
  const [start] = previousAcademicYear(academicYear).split('/');
  return `8–9 класс, ${start}–${end}`;
}

/**
 * Учебный год, на который строится план: девятиклассникам — текущий,
 * восьмиклассникам — следующий, когда они будут в 9 классе.
 */
export function planYearFor(grade, currentAcademicYear) {
  return grade === 8 ? nextAcademicYear(currentAcademicYear) : currentAcademicYear;
}

/** Дата «сегодня» в формате YYYY-MM-DD с учётом часового пояса региона. */
export function localDateString(now, utcOffsetHours) {
  const shifted = new Date(now.getTime() + utcOffsetHours * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Сколько дней от today до date (обе строки YYYY-MM-DD). */
export function daysBetween(today, date) {
  const msPerDay = 24 * 3600 * 1000;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / msPerDay);
}

/**
 * Подходит ли дата под класс и год плана. academicYear — год 9 класса (для восьмиклассника — следующий).
 * Даты 9 класса (grade пустой или 9) — из этого года; шаги 8 класса (grade 8) — только восьмикласснику,
 * из текущего года, то есть предыдущего перед планом 9 класса.
 */
function matchesGradeYear(keyDate, { academicYear, grade = 9 }) {
  if ((keyDate.grade ?? 9) === 9) return keyDate.academicYear === academicYear;
  return grade === 8 && keyDate.academicYear === previousAcademicYear(academicYear);
}

/** Подходит ли запись справочника дат под профиль семьи. */
export function matchesProfile(keyDate, {
  academicYear, grade, regionId, path, twoOgeExperiment,
}) {
  if (!matchesGradeYear(keyDate, { academicYear, grade })) return false;
  if (keyDate.scope === 'regional' && keyDate.regionId !== regionId) return false;

  const pathMatches = keyDate.path === 'any'
    || !path
    || path === PATHS.UNDECIDED
    || keyDate.path === path;
  if (!pathMatches) return false;

  if (keyDate.experiment === 'two_oge' && !twoOgeExperiment) return false;
  if (keyDate.experiment === 'standard' && twoOgeExperiment) return false;
  return true;
}

function itemStatus(keyDate, today) {
  const end = keyDate.dateEnd ?? keyDate.dateStart;
  if (end < today) return 'past';
  if (keyDate.dateStart <= today) return 'current';
  return 'upcoming';
}

/**
 * Строит план: отбирает даты под профиль, сортирует и добавляет статус и число дней до даты.
 *
 * @param {object} params
 * @param {Array<object>} params.keyDates записи справочника в camelCase
 * @param {{ academicYear: string, grade?: number, regionId: string, path: string, twoOgeExperiment: boolean }} params.profile
 * @param {Set<string>|string[]} [params.doneIds] отмеченные пункты
 * @param {Date} [params.now]
 * @param {number} [params.utcOffsetHours]
 */
export function buildPlan({ keyDates, profile, doneIds = [], now = new Date(), utcOffsetHours = 3 }) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds);
  const today = localDateString(now, utcOffsetHours);

  const items = keyDates
    .filter((keyDate) => matchesProfile(keyDate, profile))
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.id.localeCompare(b.id))
    .map((keyDate) => {
      const status = itemStatus(keyDate, today);
      return {
        ...keyDate,
        status,
        daysLeft: status === 'upcoming' ? daysBetween(today, keyDate.dateStart) : null,
        done: done.has(keyDate.id),
      };
    });

  const next = items.find((item) => item.status !== 'past' && !item.done) ?? null;
  return { today, items, nextItemId: next?.id ?? null };
}

/**
 * Расписание напоминаний по пунктам плана. Возвращает только будущие отправки.
 * Правило напоминания: { anchor: 'start' | 'end', daysBefore: number }.
 */
export function reminderSchedule({ items, utcOffsetHours = 3, now = new Date(), hour = REMINDER_HOUR }) {
  const result = [];
  for (const item of items) {
    for (const rule of item.reminders ?? []) {
      const anchorDate = rule.anchor === 'end' ? (item.dateEnd ?? item.dateStart) : item.dateStart;
      const sendAt = sendAtUtc(anchorDate, rule.daysBefore, hour, utcOffsetHours);
      if (sendAt > now) {
        result.push({
          keyDateId: item.id,
          anchor: rule.anchor,
          daysBefore: rule.daysBefore,
          sendAt: sendAt.toISOString(),
        });
      }
    }
  }
  return result.sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

export function sendAtUtc(date, daysBefore, hour, utcOffsetHours) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - daysBefore, hour - utcOffsetHours, 0, 0));
}
