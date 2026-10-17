/**
 * «Сообщить о неточности»: семья отмечает устаревший факт у программы колледжа или пункта плана.
 * Только выбор причины, без свободного текста — в сообщение не попадают личные данные.
 * Команда проекта видит сводку в боте (/reports) и сверяет факт с источником.
 */

export const REPORT_TARGETS = Object.freeze({
  PROGRAM: 'program',
  ITEM: 'item',
});

export const REPORT_REASONS = Object.freeze({
  [REPORT_TARGETS.PROGRAM]: [
    { id: 'score', title: 'Другой балл или число мест' },
    { id: 'program', title: 'Такой программы больше нет' },
    { id: 'link', title: 'Ссылка не открывается' },
    { id: 'other', title: 'Другое' },
  ],
  [REPORT_TARGETS.ITEM]: [
    { id: 'date', title: 'Дата или срок изменились' },
    { id: 'link', title: 'Ссылка не открывается' },
    { id: 'other', title: 'Другое' },
  ],
});

export const REPORT_THANKS = 'Спасибо! Команда проекта сверит факт с источником и обновит данные.';

export function isReportReason(targetType, reason) {
  return Boolean(REPORT_REASONS[targetType]?.some((item) => item.id === reason));
}

export function reportReasonTitle(targetType, reason) {
  return REPORT_REASONS[targetType]?.find((item) => item.id === reason)?.title ?? reason;
}

/** Срок обработки сообщения: сверить факт с источником и исправить или подтвердить — 3 рабочих дня. */
export const REPORT_SLA_WORKDAYS = 3;

export const REPORT_RESOLUTIONS = Object.freeze({
  FIXED: 'fixed',
  CONFIRMED: 'confirmed',
});

export const REPORT_RESOLUTION_TITLES = Object.freeze({
  [REPORT_RESOLUTIONS.FIXED]: 'исправлено',
  [REPORT_RESOLUTIONS.CONFIRMED]: 'данные верны',
});

/** «исправлено» → fixed, «верно» или «данные верны» → confirmed. */
export function parseReportResolution(word) {
  const normalized = (word ?? '').trim().toLowerCase().replaceAll('ё', 'е');
  if (/^(исправлено|fixed)$/.test(normalized)) return REPORT_RESOLUTIONS.FIXED;
  if (/^(верно|данные верны|confirmed)$/.test(normalized)) return REPORT_RESOLUTIONS.CONFIRMED;
  return null;
}

/** Дата YYYY-MM-DD через days рабочих дней: суббота и воскресенье не считаются, праздники — тоже рабочие. */
export function addWorkdays(date, days) {
  const current = new Date(`${date}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return current.toISOString().slice(0, 10);
}
