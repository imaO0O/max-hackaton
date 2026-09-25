/** Путь, к которому склоняется семья. */
export const PATHS = Object.freeze({
  SCHOOL10: 'school10',
  COLLEGE: 'college',
  UNDECIDED: 'undecided',
});

export const PATH_VALUES = Object.freeze(Object.values(PATHS));

export const PATH_TITLES = Object.freeze({
  [PATHS.SCHOOL10]: '10–11 класс',
  [PATHS.COLLEGE]: 'Колледж',
  [PATHS.UNDECIDED]: 'Пока не знаем',
});

/** Классы, для которых строится план. 8 класс — планирование заранее. */
export const GRADE_VALUES = Object.freeze([8, 9]);

/** Регион «Другой регион»: только федеральные сроки, колледжей в справочнике нет, время — московское. */
export const OTHER_REGION_ID = 'other';

/** Формы обучения в колледже. */
export const STUDY_FORMS = Object.freeze({
  full_time: 'Очная',
  part_time: 'Очно-заочная',
  extramural: 'Заочная',
});

/** Типы записей справочника ключевых дат. */
export const DATE_SCOPES = Object.freeze(['federal', 'regional', 'recommendation']);
export const DATE_KINDS = Object.freeze(['deadline', 'event', 'period', 'checklist']);
export const DATE_PATHS = Object.freeze(['any', PATHS.SCHOOL10, PATHS.COLLEGE]);
export const DATE_EXPERIMENTS = Object.freeze(['any', 'two_oge', 'standard']);
