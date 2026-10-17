import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DATA_STATUS, dataStatusExplanation, formatCheckDate, programDataStatus, STALE_AFTER_DAYS, dataStatusIcon, keyDateDataStatus,
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

const dateToday = '2026-10-17';
const federal = {
    scope: 'federal', path: 'any', sourceUrl: 'https://fipi.ru', sourceTitle: 'Порядок ГИА-9', checkedAt: '2026-09-16', isApproximate: false,
  };

test('подтверждённая дата — с датой проверки и источником', () => {
    const status = keyDateDataStatus(federal, { today: dateToday });
    assert.equal(status.status, DATA_STATUS.CONFIRMED);
    assert.equal(status.title, 'Дата подтверждена · проверено 16.09.2026');
    assert.deepEqual(status.lines, ['Источник: Порядок ГИА-9.']);
  });

test('ориентировочная дата — где уточнить зависит от пути', () => {
    const school = keyDateDataStatus({ ...federal, isApproximate: true }, { today: dateToday });
    assert.equal(school.status, DATA_STATUS.APPROXIMATE);
    assert.ok(school.lines.includes('Уточните в школе.'));
    const college = keyDateDataStatus({ ...federal, path: 'college', isApproximate: true, checkedAt: null }, { today: dateToday });
    assert.equal(college.title, 'Дата ориентировочная');
    assert.ok(college.lines.includes('Уточните в приёмной комиссии колледжа.'));
  });

test('оговорка к подтверждённой дате — с подсказкой, где уточнить', () => {
  const status = keyDateDataStatus({ ...federal, path: 'college', dataNote: 'Приказ действует до 01.01.2027.' }, { today: dateToday });
  assert.equal(status.status, DATA_STATUS.CONFIRMED);
  assert.deepEqual(status.lines, ['Источник: Порядок ГИА-9.', 'Приказ действует до 01.01.2027.', 'Уточните в приёмной комиссии колледжа.']);
});

test('совет сервиса, демо-регион, без источника и давняя проверка', () => {
    assert.equal(keyDateDataStatus({ scope: 'recommendation' }, { today: dateToday }).status, DATA_STATUS.ADVICE);
    assert.equal(keyDateDataStatus({ ...federal, scope: 'regional' }, { today: dateToday, regionIsDemo: true }).status, DATA_STATUS.DEMO);
    const unverified = keyDateDataStatus({ ...federal, sourceUrl: null }, { today: dateToday });
    assert.equal(unverified.status, DATA_STATUS.UNVERIFIED);
    assert.ok(unverified.lines.includes('Нет первоисточника.'));
    const stale = keyDateDataStatus({ ...federal, checkedAt: '2026-01-10' }, { today: dateToday });
    assert.equal(stale.status, DATA_STATUS.STALE);
    assert.equal(stale.title, 'Давно не проверялось · проверено 10.01.2026');
  });

const onlyScoreMissing = {
    passingScore: null, budgetPlaces: 25, duration: '3 г. 10 мес.', sourceUrl: 'https://college.example', checkedAt: '2026-09-16', college: {},
  };

test('нет только балла — ℹ️, нет мест — ⚠️', () => {
    const onlyScore = programDataStatus(onlyScoreMissing, { today: dateToday });
    assert.equal(onlyScore.status, DATA_STATUS.INCOMPLETE);
    assert.equal(onlyScore.minor, true);
    assert.equal(dataStatusIcon(onlyScore), 'ℹ️');
    const noPlaces = programDataStatus({ ...onlyScoreMissing, budgetPlaces: null }, { today: dateToday });
    assert.equal(noPlaces.minor, false);
    assert.equal(dataStatusIcon(noPlaces), '⚠️');
  });
