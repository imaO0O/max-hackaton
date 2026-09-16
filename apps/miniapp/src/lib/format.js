const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOMINATIVE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const parts = (date) => date.split('-').map(Number);

/** 2027-03-01 → «1 марта» */
export function formatDay(date) {
  const [, month, day] = parts(date);
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}

export function formatDateRange(start, end) {
  return end ? `${formatDay(start)} — ${formatDay(end)}` : formatDay(start);
}

/** 2027-03-01 → «Март 2027» */
export function monthTitle(date) {
  const [year, month] = parts(date);
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

export const monthKey = (date) => date.slice(0, 7);

/** 2026-09-16 → «16.09.2026» */
export function formatShortDate(date) {
  const [year, month, day] = parts(date);
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

export function plural(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const daysText = (count) => `${count} ${plural(count, ['день', 'дня', 'дней'])}`;

/** 4.6 → «4,60» */
export function formatScore(value) {
  return value === null || value === undefined ? '—' : value.toFixed(2).replace('.', ',');
}
