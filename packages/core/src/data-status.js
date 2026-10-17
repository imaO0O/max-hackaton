/**
 * Статус данных для семьи: можно ли опираться на запись или её нужно уточнить в приёмной комиссии.
 * Общий для бота и мини-приложения — чтобы формулировки совпадали.
 *
 * Правила (docs/data-verification.md):
 * - подтверждено — есть первоисточник, дата проверки не старше STALE_AFTER_DAYS и все ключевые поля заполнены;
 * - неполные данные — источник и дата есть, но колледж не опубликовал часть сведений;
 * - давно не проверялось — дата проверки старше STALE_AFTER_DAYS;
 * - не проверено — нет источника или даты проверки;
 * - демо-данные — вымышленные записи для сценария проверки.
 */

import { daysBetween } from './plan.js';

/** Через сколько дней после проверки запись считается устаревшей: правила приёма обновляются раз в год. */
export const STALE_AFTER_DAYS = 180;

export const DATA_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  INCOMPLETE: 'incomplete',
  STALE: 'stale',
  UNVERIFIED: 'unverified',
  DEMO: 'demo',
});

/** Что из ключевых сведений о программе не опубликовано. */
const PROGRAM_FIELDS = [
  ['passingScore', 'прошлогодний проходной балл'],
  ['budgetPlaces', 'число бюджетных мест'],
  ['duration', 'срок обучения'],
];

/** 2026-09-16 → «16.09.2026» */
export function formatCheckDate(date) {
  if (!date) return null;
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Статус программы колледжа.
 * @param {object} program программа с полем college (isDemo, dataNote)
 * @param {{ today: string }} options сегодняшняя дата YYYY-MM-DD
 */
export function programDataStatus(program, { today }) {
  const missing = PROGRAM_FIELDS
    .filter(([field]) => program[field] === null || program[field] === undefined || program[field] === '')
    .map(([, title]) => title);
  const base = {
    checkedAt: program.checkedAt ?? null,
    sourceUrl: program.sourceUrl ?? null,
    missing,
    note: program.college?.dataNote ?? null,
  };
  if (program.college?.isDemo) return { ...base, status: DATA_STATUS.DEMO };
  if (!program.sourceUrl || !program.checkedAt) return { ...base, status: DATA_STATUS.UNVERIFIED };
  if (daysBetween(program.checkedAt, today) > STALE_AFTER_DAYS) return { ...base, status: DATA_STATUS.STALE };
  return { ...base, status: missing.length ? DATA_STATUS.INCOMPLETE : DATA_STATUS.CONFIRMED };
}

/** Короткая подпись статуса — для списков и значков. */
export const DATA_STATUS_TITLES = Object.freeze({
  [DATA_STATUS.CONFIRMED]: 'Данные подтверждены',
  [DATA_STATUS.INCOMPLETE]: 'Неполные данные',
  [DATA_STATUS.STALE]: 'Давно не проверялось',
  [DATA_STATUS.UNVERIFIED]: 'Не проверено',
  [DATA_STATUS.DEMO]: 'Демо-данные',
});

export const DATA_STATUS_ICONS = Object.freeze({
  [DATA_STATUS.CONFIRMED]: '✅',
  [DATA_STATUS.INCOMPLETE]: '⚠️',
  [DATA_STATUS.STALE]: '⚠️',
  [DATA_STATUS.UNVERIFIED]: '⚠️',
  [DATA_STATUS.DEMO]: '🧪',
});

/**
 * Пояснение к статусу: заголовок с датой проверки, что не опубликовано и что делать семье.
 * @returns {{ title: string, lines: string[], askAdmission: boolean }}
 */
export function dataStatusExplanation(info) {
  const date = formatCheckDate(info.checkedAt);
  const title = `${DATA_STATUS_TITLES[info.status]}${date ? ` · проверено ${date}` : ''}`;
  const lines = [];
  switch (info.status) {
    case DATA_STATUS.CONFIRMED:
      lines.push('Сведения сверены с сайтом колледжа (ссылка на источник ниже).');
      break;
    case DATA_STATUS.INCOMPLETE:
      lines.push(`Колледж не опубликовал: ${info.missing.join(', ')}.`);
      if (info.note) lines.push(info.note);
      break;
    case DATA_STATUS.STALE:
      lines.push('С даты проверки прошло больше полугода — правила и цифры могли измениться.');
      break;
    case DATA_STATUS.UNVERIFIED:
      lines.push('Нет первоисточника или даты проверки.');
      break;
    case DATA_STATUS.DEMO:
      lines.push('Вымышленный колледж для демонстрации сценария.');
      break;
    default:
      break;
  }
  const askAdmission = info.status !== DATA_STATUS.CONFIRMED && info.status !== DATA_STATUS.DEMO;
  if (askAdmission) lines.push('Уточните в приёмной комиссии колледжа.');
  return { title, lines, askAdmission };
}
