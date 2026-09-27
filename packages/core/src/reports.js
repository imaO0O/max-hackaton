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
