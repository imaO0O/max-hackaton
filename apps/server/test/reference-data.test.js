import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadReferenceData, validateReferenceData } from '../src/db/reference-data.js';
import { openDatabase } from '../src/db/database.js';
import { applyReferenceData } from '../src/db/reference-data.js';
import { parseSurveyPayload } from '../src/bot/survey.js';
import { testConfig } from './helpers.js';

test('файлы справочников в репозитории корректны', () => {
  const data = loadReferenceData(testConfig().dataDir);
  assert.ok(data.colleges.length >= 10);
  assert.ok(data.keyDates.some((item) => item.scope === 'federal'));
});

test('валидатор находит ошибки в данных', () => {
  const data = loadReferenceData(testConfig().dataDir);
  const broken = structuredClone(data);
  broken.colleges[0].regionId = 'missing-region';
  broken.colleges[1].programs[0].passingScore = 7;
  broken.keyDates[0].dateStart = '01.10.2026';
  broken.keyDates[1].scope = 'regional';
  broken.keyDates[1].regionId = null;
  const errors = validateReferenceData(broken);
  assert.equal(errors.length, 4, errors.join('\n'));
});

test('реальные данные без источника и даты проверки не проходят', () => {
  const data = loadReferenceData(testConfig().dataDir);
  const real = data.colleges.filter((college) => college.isDemo === false);
  assert.ok(real.length >= 10, 'пилотный регион: не меньше 10 реальных колледжей');

  const broken = structuredClone(data);
  broken.colleges.find((college) => college.isDemo === false).programs[0].sourceUrl = null;
  broken.regions.find((region) => region.isDemo === false).checkedAt = null;
  const errors = validateReferenceData(broken);
  assert.equal(errors.length, 2, errors.join('\n'));
});

test('повторная загрузка справочников сохраняет избранное и удаляет исчезнувшие записи', () => {
  const db = openDatabase(':memory:');
  const data = loadReferenceData(testConfig().dataDir);
  applyReferenceData(db, data);

  const programId = db.prepare('SELECT id FROM college_specialty LIMIT 1').get().id;
  db.prepare("INSERT INTO users (max_user_id, created_at, updated_at) VALUES (1, 'x', 'x')").run();
  db.prepare("INSERT INTO favorites (user_id, college_specialty_id, created_at) VALUES (1, ?, 'x')").run(programId);

  applyReferenceData(db, data);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM favorites').get().count, 1);

  const reduced = structuredClone(data);
  reduced.keyDates = reduced.keyDates.slice(1);
  applyReferenceData(db, reduced);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM key_dates').get().count, data.keyDates.length - 1);
  db.close();
});

test('разбор payload кнопок опроса', () => {
  assert.deepEqual(parseSurveyPayload('survey:region:demo-standard'), { action: 'region', value: 'demo-standard' });
  assert.deepEqual(parseSurveyPayload('survey:interests-done'), { action: 'interests-done', value: null });
  assert.equal(parseSurveyPayload('other:thing'), null);
  assert.equal(parseSurveyPayload(undefined), null);
});
