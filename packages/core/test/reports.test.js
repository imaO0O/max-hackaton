import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addWorkdays, parseReportResolution, REPORT_RESOLUTIONS, REPORT_SLA_WORKDAYS,
} from '../src/reports.js';

test('срок обработки: рабочие дни без субботы и воскресенья', () => {
  assert.equal(REPORT_SLA_WORKDAYS, 3);
  assert.equal(addWorkdays('2026-09-16', 3), '2026-09-21', 'среда → понедельник');
  assert.equal(addWorkdays('2026-09-18', 3), '2026-09-23', 'пятница → среда');
  assert.equal(addWorkdays('2026-09-19', 1), '2026-09-21', 'суббота → понедельник');
});

test('итог обработки сообщения', () => {
  assert.equal(parseReportResolution('Исправлено'), REPORT_RESOLUTIONS.FIXED);
  assert.equal(parseReportResolution('верно'), REPORT_RESOLUTIONS.CONFIRMED);
  assert.equal(parseReportResolution('данные верны'), REPORT_RESOLUTIONS.CONFIRMED);
  assert.equal(parseReportResolution('потом'), null);
});
