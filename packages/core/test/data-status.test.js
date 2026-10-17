import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DATA_STATUS, dataStatusExplanation, formatCheckDate, programDataStatus, STALE_AFTER_DAYS,
} from '../src/data-status.js';

const college = { isDemo: false, dataNote: null };
const full = {
  passingScore: 4.69, budgetPlaces: 30, duration: '3 г. 10 мес.',
  sourceUrl: 'https://example.ru/priem', checkedAt: '2026-09-16', college,
};
const today = '2026-10-29';

test('подтверждено: источник, свежая дата проверки и все ключевые поля', () => {
  const info = programDataStatus(full, { today });
  assert.equal(info.status, DATA_STATUS.CONFIRMED);
  const text = dataStatusExplanation(info);
  assert.equal(text.title, 'Данные подтверждены · проверено 16.09.2026');
  assert.equal(text.askAdmission, false);
});

test('неполные данные: что не опубликовано, пояснение колледжа и приёмная комиссия', () => {
  const info = programDataStatus({
    ...full, passingScore: null, budgetPlaces: null, college: { ...college, dataNote: 'План приёма опубликован сканом.' },
  }, { today });
  assert.equal(info.status, DATA_STATUS.INCOMPLETE);
  assert.deepEqual(info.missing, ['прошлогодний проходной балл', 'число бюджетных мест']);
  const text = dataStatusExplanation(info);
  assert.equal(text.title, 'Неполные данные · проверено 16.09.2026');
  assert.match(text.lines.join('\n'), /Колледж не опубликовал: прошлогодний проходной балл, число бюджетных мест\./);
  assert.match(text.lines.join('\n'), /План приёма опубликован сканом\./);
  assert.match(text.lines.at(-1), /Уточните в приёмной комиссии/);
  assert.equal(text.askAdmission, true);
});

test('давно не проверялось, не проверено и демо', () => {
  const old = programDataStatus({ ...full, checkedAt: '2026-01-01' }, { today });
  assert.equal(old.status, DATA_STATUS.STALE, `старше ${STALE_AFTER_DAYS} дней`);
  assert.equal(programDataStatus({ ...full, checkedAt: null }, { today }).status, DATA_STATUS.UNVERIFIED);
  assert.equal(programDataStatus({ ...full, sourceUrl: null }, { today }).status, DATA_STATUS.UNVERIFIED);
  const demo = programDataStatus({ ...full, college: { isDemo: true } }, { today });
  assert.equal(demo.status, DATA_STATUS.DEMO);
  assert.equal(dataStatusExplanation(demo).askAdmission, false);
  assert.equal(formatCheckDate(null), null);
});
