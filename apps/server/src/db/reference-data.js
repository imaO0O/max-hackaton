import fs from 'node:fs';
import path from 'node:path';

import {
  DATE_EXPERIMENTS, DATE_KINDS, DATE_PATHS, DATE_SCOPES, STUDY_FORMS,
} from '@posle9/core';

import { transaction } from './database.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9-]+$/;
const YEAR_RE = /^\d{4}\/\d{4}$/;

function readJson(dataDir, file) {
  const fullPath = path.join(dataDir, file);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(`Не удалось прочитать ${fullPath}: ${error.message}`);
  }
}

/** Идентификатор программы колледжа: стабильный, без точек и двоеточий. */
export function programId(collegeId, specialtyCode, form) {
  return `${collegeId}--${specialtyCode.replaceAll('.', '')}--${form}`;
}

/** Читает JSON-файлы справочников и проверяет их. Бросает ошибку со списком всех проблем. */
export function loadReferenceData(dataDir) {
  const data = {
    regions: readJson(dataDir, 'regions.json'),
    interests: readJson(dataDir, 'interests.json'),
    specialties: readJson(dataDir, 'specialties.json'),
    colleges: readJson(dataDir, 'colleges.json'),
    keyDates: readJson(dataDir, 'key-dates.json'),
    content: readJson(dataDir, 'content.json'),
  };
  const errors = validateReferenceData(data);
  if (errors.length > 0) {
    throw new Error(`Ошибки в справочных данных (${errors.length}):\n- ${errors.join('\n- ')}`);
  }
  return data;
}

export function validateReferenceData({ regions, interests, specialties, colleges, keyDates, content }) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const isDateOrNull = (value) => value === null || value === undefined || DATE_RE.test(value);
  const uniqueIds = (items, key, label) => {
    const seen = new Set();
    for (const item of items) {
      check(!seen.has(item[key]), `${label}: повторяется ${key} «${item[key]}»`);
      seen.add(item[key]);
    }
    return seen;
  };

  for (const [name, value] of Object.entries({ regions, interests, specialties, colleges, keyDates })) {
    check(Array.isArray(value), `${name}: ожидается массив`);
  }
  if (errors.length > 0) return errors;

  const regionIds = uniqueIds(regions, 'id', 'regions.json');
  for (const region of regions) {
    check(ID_RE.test(region.id ?? ''), `regions.json: некорректный id «${region.id}»`);
    check(typeof region.name === 'string' && region.name.length > 0, `regions.json: нет name у «${region.id}»`);
    check(Number.isInteger(region.utcOffsetHours), `regions.json: utcOffsetHours у «${region.id}» должен быть целым`);
    check(typeof region.twoOgeExperiment === 'boolean', `regions.json: twoOgeExperiment у «${region.id}» должен быть true/false`);
    check(isDateOrNull(region.checkedAt), `regions.json: checkedAt у «${region.id}» — YYYY-MM-DD или null`);
    if (region.isDemo === false) {
      check(Boolean(region.checkedAt), `regions.json: у реального региона «${region.id}» нужна дата проверки checkedAt`);
    }
  }

  const interestIds = uniqueIds(interests, 'id', 'interests.json');
  const specialtyCodes = uniqueIds(specialties, 'code', 'specialties.json');
  for (const specialty of specialties) {
    check(/^\d{2}\.\d{2}\.\d{2}$/.test(specialty.code ?? ''), `specialties.json: некорректный код «${specialty.code}»`);
    check(interestIds.has(specialty.interestId), `specialties.json: неизвестная сфера «${specialty.interestId}» у ${specialty.code}`);
  }

  uniqueIds(colleges, 'id', 'colleges.json');
  for (const college of colleges) {
    const label = `colleges.json «${college.id}»`;
    check(ID_RE.test(college.id ?? ''), `${label}: некорректный id`);
    check(regionIds.has(college.regionId), `${label}: неизвестный регион «${college.regionId}»`);
    check(typeof college.city === 'string' && college.city.length > 0, `${label}: нет города`);
    check(Array.isArray(college.programs) && college.programs.length > 0, `${label}: нет программ`);
    const programKeys = new Set();
    for (const program of college.programs ?? []) {
      const key = `${program.specialtyCode}/${program.form}`;
      check(!programKeys.has(key), `${label}: программа ${key} повторяется`);
      programKeys.add(key);
      check(specialtyCodes.has(program.specialtyCode), `${label}: неизвестная специальность ${program.specialtyCode}`);
      check(Object.hasOwn(STUDY_FORMS, program.form), `${label}: неизвестная форма обучения «${program.form}»`);
      check(program.passingScore === null || (program.passingScore >= 2 && program.passingScore <= 5),
        `${label}: проходной балл ${program.specialtyCode} должен быть от 2 до 5 или null`);
      check(isDateOrNull(program.checkedAt), `${label}: checkedAt у ${program.specialtyCode} — YYYY-MM-DD или null`);
      if (college.isDemo === false) {
        check(Boolean(program.sourceUrl) && Boolean(program.checkedAt),
          `${label}: у реальной программы ${program.specialtyCode} нужны sourceUrl и checkedAt`);
      }
    }
  }

  uniqueIds(keyDates, 'id', 'key-dates.json');
  for (const keyDate of keyDates) {
    const label = `key-dates.json «${keyDate.id}»`;
    check(YEAR_RE.test(keyDate.academicYear ?? ''), `${label}: academicYear в формате 2026/2027`);
    check(DATE_SCOPES.includes(keyDate.scope), `${label}: неизвестный scope «${keyDate.scope}»`);
    check(DATE_KINDS.includes(keyDate.kind), `${label}: неизвестный kind «${keyDate.kind}»`);
    check(DATE_PATHS.includes(keyDate.path), `${label}: неизвестный path «${keyDate.path}»`);
    check(DATE_EXPERIMENTS.includes(keyDate.experiment), `${label}: неизвестный experiment «${keyDate.experiment}»`);
    check(DATE_RE.test(keyDate.dateStart ?? ''), `${label}: dateStart в формате YYYY-MM-DD`);
    check(isDateOrNull(keyDate.dateEnd), `${label}: dateEnd — YYYY-MM-DD или null`);
    check(!keyDate.dateEnd || keyDate.dateEnd >= keyDate.dateStart, `${label}: dateEnd раньше dateStart`);
    check(isDateOrNull(keyDate.checkedAt), `${label}: checkedAt — YYYY-MM-DD или null`);
    check(keyDate.grade === undefined || keyDate.grade === null || [8, 9].includes(keyDate.grade),
      `${label}: grade — 8 (шаг 8 класса), 9 или пусто`);
    if (keyDate.scope === 'regional') {
      check(regionIds.has(keyDate.regionId), `${label}: для региональной даты нужен существующий regionId`);
    } else {
      check(!keyDate.regionId, `${label}: regionId заполняется только у региональных дат`);
    }
    check(Array.isArray(keyDate.reminders), `${label}: reminders должен быть массивом`);
    for (const rule of keyDate.reminders ?? []) {
      check(['start', 'end'].includes(rule.anchor) && Number.isInteger(rule.daysBefore) && rule.daysBefore >= 0,
        `${label}: напоминание должно быть { anchor: start|end, daysBefore: целое ≥ 0 }`);
    }
  }

  check(content && Array.isArray(content.paths) && Array.isArray(content.nextSteps), 'content.json: нужны массивы paths и nextSteps');
  return errors;
}

const bool = (value) => (value ? 1 : 0);

/**
 * Синхронизирует справочники в базе с файлами: добавляет, обновляет и удаляет записи,
 * которых больше нет в файлах. Идентификаторы стабильны, поэтому избранное и отметки сохраняются.
 */
export function applyReferenceData(db, data) {
  transaction(db, () => {
    // Порядок регионов в опросе — порядок в файле
    const upsertRegion = db.prepare(`
      INSERT INTO regions (id, name, utc_offset_hours, two_oge_experiment, is_demo, profile_class_rules, profile_class_rules_url, checked_at, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, utc_offset_hours = excluded.utc_offset_hours,
        two_oge_experiment = excluded.two_oge_experiment, is_demo = excluded.is_demo,
        profile_class_rules = excluded.profile_class_rules, profile_class_rules_url = excluded.profile_class_rules_url,
        checked_at = excluded.checked_at, sort_order = excluded.sort_order`);
    data.regions.forEach((region, index) => {
      upsertRegion.run(region.id, region.name, region.utcOffsetHours, bool(region.twoOgeExperiment), bool(region.isDemo),
        region.profileClassRules ?? null, region.profileClassRulesUrl ?? null, region.checkedAt ?? null, index);
    });

    const upsertInterest = db.prepare(`
      INSERT INTO interests (id, title, emoji, sort_order) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, emoji = excluded.emoji, sort_order = excluded.sort_order`);
    data.interests.forEach((interest, index) => {
      upsertInterest.run(interest.id, interest.title, interest.emoji ?? null, index);
    });

    const upsertSpecialty = db.prepare(`
      INSERT INTO specialties (code, title, interest_id) VALUES (?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET title = excluded.title, interest_id = excluded.interest_id`);
    for (const specialty of data.specialties) {
      upsertSpecialty.run(specialty.code, specialty.title, specialty.interestId);
    }

    const upsertCollege = db.prepare(`
      INSERT INTO colleges (id, region_id, city, name, address, website, has_dormitory, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET region_id = excluded.region_id, city = excluded.city, name = excluded.name,
        address = excluded.address, website = excluded.website, has_dormitory = excluded.has_dormitory, is_demo = excluded.is_demo`);
    const upsertProgram = db.prepare(`
      INSERT INTO college_specialty (id, college_id, specialty_code, form, duration, budget_places, passing_score, score_year, entrance_test, source_url, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET duration = excluded.duration, budget_places = excluded.budget_places,
        passing_score = excluded.passing_score, score_year = excluded.score_year, entrance_test = excluded.entrance_test,
        source_url = excluded.source_url, checked_at = excluded.checked_at`);
    const programIds = [];
    for (const college of data.colleges) {
      upsertCollege.run(college.id, college.regionId, college.city, college.name, college.address ?? null,
        college.website ?? null, bool(college.hasDormitory), bool(college.isDemo));
      for (const program of college.programs) {
        const id = programId(college.id, program.specialtyCode, program.form);
        programIds.push(id);
        upsertProgram.run(id, college.id, program.specialtyCode, program.form, program.duration ?? null,
          program.budgetPlaces ?? null, program.passingScore ?? null, program.scoreYear ?? null,
          program.entranceTest ?? null, program.sourceUrl ?? null, program.checkedAt ?? null);
      }
    }

    const upsertKeyDate = db.prepare(`
      INSERT INTO key_dates (id, academic_year, scope, region_id, kind, path, experiment, date_start, date_end,
        is_approximate, title, description, reminders, source_title, source_url, checked_at, grade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET academic_year = excluded.academic_year, scope = excluded.scope,
        region_id = excluded.region_id, kind = excluded.kind, path = excluded.path, experiment = excluded.experiment,
        date_start = excluded.date_start, date_end = excluded.date_end, is_approximate = excluded.is_approximate,
        title = excluded.title, description = excluded.description, reminders = excluded.reminders,
        source_title = excluded.source_title, source_url = excluded.source_url, checked_at = excluded.checked_at,
        grade = excluded.grade`);
    for (const keyDate of data.keyDates) {
      upsertKeyDate.run(keyDate.id, keyDate.academicYear, keyDate.scope, keyDate.regionId ?? null, keyDate.kind,
        keyDate.path, keyDate.experiment, keyDate.dateStart, keyDate.dateEnd ?? null, bool(keyDate.isApproximate),
        keyDate.title, keyDate.description, JSON.stringify(keyDate.reminders ?? []), keyDate.sourceTitle ?? null,
        keyDate.sourceUrl ?? null, keyDate.checkedAt ?? null, keyDate.grade ?? null);
    }

    deleteMissing(db, 'key_dates', 'id', data.keyDates.map((item) => item.id));
    deleteMissing(db, 'college_specialty', 'id', programIds);
    deleteMissing(db, 'colleges', 'id', data.colleges.map((item) => item.id));
    deleteMissing(db, 'specialties', 'code', data.specialties.map((item) => item.code));
    deleteMissing(db, 'interests', 'id', data.interests.map((item) => item.id));
    deleteMissing(db, 'regions', 'id', data.regions.map((item) => item.id));
  });
}

function deleteMissing(db, table, column, keepIds) {
  const existing = db.prepare(`SELECT ${column} AS id FROM ${table}`).all().map((row) => row.id);
  const keep = new Set(keepIds);
  const remove = db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`);
  for (const id of existing) {
    if (!keep.has(id)) remove.run(id);
  }
}
