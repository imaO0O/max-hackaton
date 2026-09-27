const toBool = (value) => value === 1;

function mapRegion(row) {
  return row && {
    id: row.id,
    name: row.name,
    utcOffsetHours: row.utc_offset_hours,
    twoOgeExperiment: toBool(row.two_oge_experiment),
    isDemo: toBool(row.is_demo),
    profileClassRules: row.profile_class_rules,
    profileClassRulesUrl: row.profile_class_rules_url,
    checkedAt: row.checked_at,
    // Есть ли колледжи региона в справочнике: если нет, мини-приложение не спрашивает город и не показывает фильтры
    hasColleges: toBool(row.has_colleges),
    // Перечень колледжей и профессий эксперимента с двумя ОГЭ, по которому отмечены программы; null — перечня нет
    experimentList: row.experiment_list_year
      ? { year: row.experiment_list_year, sourceUrl: row.experiment_list_url, checkedAt: row.experiment_list_checked_at }
      : null,
  };
}

const REGION_COLUMNS = 'r.*, EXISTS (SELECT 1 FROM colleges c WHERE c.region_id = r.id) AS has_colleges';

function mapProgram(row) {
  return {
    id: row.program_id,
    specialtyCode: row.specialty_code,
    specialtyTitle: row.specialty_title,
    interestId: row.interest_id,
    form: row.form,
    duration: row.duration,
    budgetPlaces: row.budget_places,
    passingScore: row.passing_score,
    scoreYear: row.score_year,
    entranceTest: row.entrance_test,
    sourceUrl: row.source_url,
    checkedAt: row.program_checked_at,
    inExperimentList: toBool(row.program_in_experiment_list),
  };
}

function mapCollege(row) {
  return {
    id: row.college_id,
    regionId: row.region_id,
    city: row.city,
    name: row.name,
    address: row.address,
    website: row.website,
    hasDormitory: toBool(row.has_dormitory),
    isDemo: toBool(row.is_demo),
    inExperimentList: toBool(row.college_in_experiment_list),
  };
}

export function mapKeyDate(row) {
  return {
    id: row.id,
    academicYear: row.academic_year,
    grade: row.grade ?? 9,
    scope: row.scope,
    regionId: row.region_id,
    kind: row.kind,
    path: row.path,
    experiment: row.experiment,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    isApproximate: toBool(row.is_approximate),
    title: row.title,
    description: row.description,
    reminders: JSON.parse(row.reminders),
    // Шаги чек-листа ({ id, title }); у обычных пунктов — пустой список
    steps: row.steps ? JSON.parse(row.steps) : [],
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    checkedAt: row.checked_at,
  };
}

const PROGRAM_SELECT = `
  SELECT c.id AS college_id, c.region_id, c.city, c.name, c.address, c.website, c.has_dormitory, c.is_demo,
    c.in_experiment_list AS college_in_experiment_list,
    cs.id AS program_id, cs.specialty_code, s.title AS specialty_title, s.interest_id, cs.form, cs.duration,
    cs.budget_places, cs.passing_score, cs.score_year, cs.entrance_test, cs.source_url, cs.checked_at AS program_checked_at,
    cs.in_experiment_list AS program_in_experiment_list
  FROM college_specialty cs
  JOIN colleges c ON c.id = cs.college_id
  JOIN specialties s ON s.code = cs.specialty_code`;

/** Группирует строки «колледж × программа» в колледжи со списком программ. */
function groupColleges(rows) {
  const colleges = new Map();
  for (const row of rows) {
    if (!colleges.has(row.college_id)) {
      colleges.set(row.college_id, { ...mapCollege(row), programs: [] });
    }
    colleges.get(row.college_id).programs.push(mapProgram(row));
  }
  return [...colleges.values()];
}

export function createReferenceRepository(db) {
  return {
    listRegions() {
      return db.prepare(`SELECT ${REGION_COLUMNS} FROM regions r ORDER BY r.is_demo, r.sort_order, r.name`).all().map(mapRegion);
    },

    getRegion(id) {
      return mapRegion(db.prepare(`SELECT ${REGION_COLUMNS} FROM regions r WHERE r.id = ?`).get(id)) ?? null;
    },

    listInterests() {
      return db.prepare('SELECT id, title, emoji FROM interests ORDER BY sort_order').all()
        .map((row) => ({ id: row.id, title: row.title, emoji: row.emoji }));
    },

    listSpecialties({ interestId } = {}) {
      const rows = interestId
        ? db.prepare('SELECT * FROM specialties WHERE interest_id = ? ORDER BY code').all(interestId)
        : db.prepare('SELECT * FROM specialties ORDER BY code').all();
      return rows.map((row) => ({ code: row.code, title: row.title, interestId: row.interest_id }));
    },

    listCities(regionId) {
      return db.prepare('SELECT DISTINCT city FROM colleges WHERE region_id = ? ORDER BY city').all(regionId)
        .map((row) => row.city);
    },

    /** Колледжи региона с программами, подходящими под фильтры. Колледжи без подходящих программ не возвращаются. */
    searchColleges({
      regionId, city, interestIds, specialtyCode, form, budgetOnly, experimentOnly,
    }) {
      const where = ['c.region_id = ?'];
      const params = [regionId];
      if (city) {
        where.push('c.city = ?');
        params.push(city);
      }
      if (interestIds?.length) {
        where.push(`s.interest_id IN (${interestIds.map(() => '?').join(', ')})`);
        params.push(...interestIds);
      }
      if (specialtyCode) {
        where.push('cs.specialty_code = ?');
        params.push(specialtyCode);
      }
      if (form) {
        where.push('cs.form = ?');
        params.push(form);
      }
      if (budgetOnly) {
        where.push('cs.budget_places > 0');
      }
      if (experimentOnly) {
        // Программы из перечня эксперимента: на них поступают с аттестатом по двум ОГЭ
        where.push('cs.in_experiment_list = 1');
      }
      const rows = db.prepare(`${PROGRAM_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.name, cs.specialty_code, cs.form`)
        .all(...params);
      return groupColleges(rows);
    },

    getCollege(id) {
      const rows = db.prepare(`${PROGRAM_SELECT} WHERE c.id = ? ORDER BY cs.specialty_code, cs.form`).all(id);
      return groupColleges(rows)[0] ?? null;
    },

    getProgram(id) {
      const row = db.prepare(`${PROGRAM_SELECT} WHERE cs.id = ?`).get(id);
      return row ? { ...mapProgram(row), college: mapCollege(row) } : null;
    },

    listKeyDates(academicYear) {
      return db.prepare('SELECT * FROM key_dates WHERE academic_year = ? ORDER BY date_start, id').all(academicYear)
        .map(mapKeyDate);
    },

    getKeyDate(id) {
      const row = db.prepare('SELECT * FROM key_dates WHERE id = ?').get(id);
      return row ? mapKeyDate(row) : null;
    },
  };
}
