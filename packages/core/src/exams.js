import { OTHER_REGION_ID, PATHS } from './constants.js';

/**
 * Подсказка «2 или 4 ОГЭ?» для регионов эксперимента по расширению доступности СПО (40-ФЗ).
 * Два вопроса — куда собирается подросток и есть ли выбранная профессия в перечне региона —
 * дают рекомендацию с объяснением. Решение за семью не принимается: это подсказка по правилам.
 */

/** Регионы эксперимента с двумя ОГЭ в 2026 году — Федеральный закон № 40-ФЗ в ред. от 29.12.2025. */
export const TWO_OGE_REGIONS_2026 = Object.freeze([
  'Москва',
  'Санкт-Петербург',
  'Республика Татарстан',
  'Московская область',
  'Липецкая область',
  'Ростовская область',
  'Тверская область',
  'Тюменская область',
  'Мурманская область',
  'Смоленская область',
  'Камчатский край',
  'Ханты-Мансийский автономный округ — Югра',
]);

export const EXAM_CHOICES = Object.freeze({
  COLLEGE: 'college',
  UNSURE: 'unsure',
  SCHOOL10: 'school10',
});

export const PROFESSION_ANSWERS = Object.freeze({
  LISTED: 'listed',
  NOT_LISTED: 'not_listed',
  UNKNOWN: 'unknown',
});

export const EXAM_QUESTIONS = Object.freeze({
  choice: {
    text: 'Куда подросток собирается после 9 класса?',
    options: [
      { id: EXAM_CHOICES.COLLEGE, title: 'В колледж — решили' },
      { id: EXAM_CHOICES.UNSURE, title: 'Пока не уверены' },
      { id: EXAM_CHOICES.SCHOOL10, title: 'В 10 класс' },
    ],
  },
  profession: {
    text: 'Выбранная профессия есть в перечне эксперимента вашего региона?',
    options: [
      { id: PROFESSION_ANSWERS.LISTED, title: 'Да, есть' },
      { id: PROFESSION_ANSWERS.NOT_LISTED, title: 'Нет' },
      { id: PROFESSION_ANSWERS.UNKNOWN, title: 'Не знаю' },
    ],
  },
});

const CHOICE_IDS = Object.values(EXAM_CHOICES);
const PROFESSION_IDS = Object.values(PROFESSION_ANSWERS);

export const isExamChoice = (value) => CHOICE_IDS.includes(value);
export const isProfessionAnswer = (value) => PROFESSION_IDS.includes(value);

/** Ответ на первый вопрос, подсказанный путём из опроса: «Пока не знаем» — «Пока не уверены». */
export function examChoiceFromPath(path) {
  if (path === PATHS.COLLEGE) return EXAM_CHOICES.COLLEGE;
  if (path === PATHS.SCHOOL10) return EXAM_CHOICES.SCHOOL10;
  return EXAM_CHOICES.UNSURE;
}

/** Нужен ли второй вопрос — про перечень профессий. Только в регионе эксперимента и только для колледжа. */
export function needsProfessionQuestion({ regionId, twoOgeExperiment, choice }) {
  return choice === EXAM_CHOICES.COLLEGE && twoOgeExperiment && regionId !== OTHER_REGION_ID;
}

/**
 * Рекомендация: сколько ОГЭ сдавать.
 * exams — 2 или 4; null — если регион не выбран из справочника и ответ зависит от того, идёт ли там эксперимент.
 *
 * @param {{ regionId: string, twoOgeExperiment: boolean, choice: string, profession?: string }} answers
 * @returns {{ exams: 2 | 4 | null, reason: string }}
 */
export function recommendExams({
  regionId, twoOgeExperiment, choice, profession,
}) {
  const knownRegion = regionId !== OTHER_REGION_ID;
  if (knownRegion && !twoOgeExperiment) return { exams: 4, reason: 'standard_region' };
  if (choice === EXAM_CHOICES.SCHOOL10) return { exams: 4, reason: 'school10' };
  if (choice !== EXAM_CHOICES.COLLEGE) return { exams: 4, reason: 'keep_both' };
  if (!knownRegion) return { exams: null, reason: 'unknown_region' };
  if (profession === PROFESSION_ANSWERS.LISTED) return { exams: 2, reason: 'college_listed' };
  if (profession === PROFESSION_ANSWERS.NOT_LISTED) return { exams: 4, reason: 'college_not_listed' };
  return { exams: 4, reason: 'college_unknown' };
}

/** Тексты рекомендаций: одни и те же в чате и в мини-приложении. */
export const EXAM_ADVICE = Object.freeze({
  standard_region: {
    title: 'Четыре ОГЭ',
    text: 'В вашем регионе нет эксперимента с двумя ОГЭ: аттестат выдают по четырём экзаменам — русскому языку, математике и двум предметам по выбору. С ним открыты и 10 класс, и колледж.',
  },
  school10: {
    title: 'Четыре ОГЭ',
    text: 'В 10 класс принимают только с аттестатом по четырём экзаменам: русский язык, математика и два предмета по выбору. Предметы по выбору лучше взять под профиль 10 класса — по ним может быть индивидуальный отбор.',
  },
  keep_both: {
    title: 'Четыре ОГЭ',
    text: 'Пока путь не выбран, четыре экзамена оставляют открытыми и 10 класс, и любой колледж. С аттестатом по двум ОГЭ в 10 класс не примут, а в колледж — только на профессии из перечня региона.',
  },
  college_listed: {
    title: 'Можно два ОГЭ',
    text: 'С аттестатом по русскому языку и математике поступают на профессии и специальности из перечня эксперимента вашего региона. Но в 10 класс с таким аттестатом не примут, а другие программы колледжей будут закрыты. Если есть сомнения в выборе, четыре экзамена оставят открытыми оба пути.',
  },
  college_not_listed: {
    title: 'Четыре ОГЭ',
    text: 'Выбранной программы нет в перечне эксперимента: на неё поступают по обычным правилам — с аттестатом по четырём экзаменам.',
  },
  college_unknown: {
    title: 'Скорее четыре ОГЭ',
    text: 'Пока не ясно, есть ли выбранная профессия в перечне эксперимента, безопаснее четыре экзамена: с ними доступны любые колледжи и 10 класс. Посмотрите программы из перечня — если к 1 марта выберете одну из них, можно сдавать два.',
  },
  unknown_region: {
    title: 'Зависит от региона',
    text: `В 2026 году два ОГЭ вместо четырёх можно сдавать в 12 регионах: ${TWO_OGE_REGIONS_2026.join(', ')}. Если вашего региона в списке нет — сдаются четыре ОГЭ. Если есть — перечень профессий смотрите на сайте регионального министерства образования.`,
  },
});

export const EXAM_ADVICE_NOTE = 'Экзамены выбирают заявлением в школе до 1 марта. Это подсказка по правилам, а не решение за семью — обсудите её с подростком и классным руководителем.';

/** Перечень эксперимента меняется каждый год: напоминание сверить профессию с новым перечнем. */
export function experimentListNote(year) {
  return `Перечень ${year} года. Перечень на следующий год публикует региональное министерство образования — сверьте профессию в приёмной комиссии колледжа.`;
}
