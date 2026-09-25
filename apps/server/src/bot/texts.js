import { OTHER_REGION_ID, PATH_TITLES, planPeriodLabel } from '@posle9/core';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 2027-03-01 → «1 марта» */
export function formatDate(date) {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** 2027-03-01 → «1 мар» */
export function formatShortDate(date) {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

/** 2026-09-16 → «16.09.2026» */
export function formatCheckedAt(date) {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

/** plural(3, ['день', 'дня', 'дней']) → «дня» */
export function plural(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** 5 → «5 дней» */
export const daysText = (count) => `${count} ${plural(count, ['день', 'дня', 'дней'])}`;

/** Сколько осталось до даты: до полутора месяцев — в днях, дальше — в месяцах, так проще прочитать. */
export function untilText(days) {
  if (days <= 45) return `через ${daysText(days)}`;
  const months = Math.round(days / 30.44);
  return `через ${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`;
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export const TOTAL_STEPS = 5;

export const texts = {
  welcome: [
    'Здравствуйте! Я помогу семье девятиклассника спланировать год и выбрать путь: 10 класс или колледж.',
    '',
    'Отвечу на 5 вопросов — и соберу план с датами, калькулятор среднего балла и подборку колледжей региона. Планом можно поделиться с подростком.',
  ].join('\n'),
  welcomeBack: 'С возвращением! План уже готов — откройте его или обновите ответы.',
  askRegion: `Шаг 1 из ${TOTAL_STEPS}. Выберите регион:`,
  askCity: `Шаг 2 из ${TOTAL_STEPS}. В каком городе ищем колледжи?`,
  cityHint: 'В списке — города, где в справочнике есть колледжи. Если вашего города нет, выберите «Любой город региона»: покажу колледжи всего региона.',
  askGrade: `Шаг 3 из ${TOTAL_STEPS}. В каком классе сейчас подросток?`,
  askInterests: `Шаг 4 из ${TOTAL_STEPS}. Что интересно подростку? Можно выбрать несколько, затем нажмите «Готово».`,
  askPath: `Шаг 5 из ${TOTAL_STEPS}. К какому пути склоняется семья?`,
  surveyExpired: 'Этот вопрос устарел. Начнём заново?',
  surveyDone: 'Ответы уже сохранены, план готов. Поменять их можно кнопкой «Изменить ответы».',
  reminderExampleNote: 'Это пример. Настоящие напоминания приходят в 10:00 по времени региона перед важными датами плана.',
  detailsBelow: 'Подробности — в сообщении ниже',
  itemMarked: 'Отмечено в плане. Напоминаний по этому пункту больше не будет',
  itemUnmarked: 'Отметка снята',
  help: [
    'Что я умею:',
    '/start — ответить на вопросы и собрать план',
    '/plan — ближайшие даты плана прямо в чате',
    '/share — отправить план подростку',
    '/colleges — колледжи по интересам из ответов',
    '/paths — чем отличаются 10–11 класс и колледж',
    '/reminders — включить или выключить напоминания',
    '/test_reminder — показать пример напоминания прямо сейчас',
    '/delete_data — удалить мои данные из сервиса',
    '',
    'Сервис не подаёт заявления и не рассчитывает шансы на поступление. Сроки и условия сверяйте в школе и в правилах приёма колледжа.',
  ].join('\n'),
  needSurvey: 'Сначала ответьте на 5 вопросов — это займёт минуту.',
  error: 'Что-то пошло не так. Попробуйте ещё раз или начните заново: /start',
  deleteConfirm: [
    'Удалить все ваши данные из сервиса?',
    '',
    'Мы храним только ваш ID в MAX, ответы на вопросы (регион, город, класс, интересы, путь), отметки плана, избранные программы и расписание напоминаний. Имена и оценки не хранятся — оценки калькулятора остаются только на вашем телефоне.',
    '',
    'После удаления план и ссылка на него перестанут работать, напоминания не придут. Отменить удаление нельзя.',
  ].join('\n'),
  deleteDone: 'Данные удалены. Если захотите начать заново — /start',
  menu: 'Что сделать? Всё доступно прямо здесь, в чате, а подробнее — в мини-приложении.',
  planItemsHint: 'Нажмите на дату — откроются подробности и кнопка «Отметить выполненным».',
  sharedItemsHint: 'Нажмите на дату — откроются подробности.',
  tooFast: 'Слишком много сообщений подряд. Подождите минуту — и продолжим.',
  notUnderstood: 'Я понимаю кнопки и несколько тем: даты плана, колледжи, «10 класс или колледж», средний балл, напоминания. Выберите в меню или напишите, например: «когда ОГЭ» или «колледжи».',
  thanks: 'Пожалуйста! Если понадоблюсь — меню ниже.',
  remindersStatusOn: 'Напоминания включены: напишу в 10:00 по времени региона перед важными датами плана.',
  remindersStatusOff: 'Напоминания сейчас выключены — важные даты придётся отслеживать самостоятельно.',
  gradesInApp: 'Средний балл аттестата считает калькулятор в мини-приложении: введите оценки — он выставит итоговые отметки по правилам аттестата и подберёт программы колледжей, где в прошлом году проходной балл был не выше. Оценки остаются только на вашем телефоне.',
  noDatesYet: 'В плане пока нет дат на этот учебный год.',
  followerMenu: 'Вы получаете напоминания по плану, которым с вами поделились. План всегда здесь — кнопка «План семьи». Можно собрать и свой план.',
  familyPlanIntro: 'План семьи — им с вами поделились по ссылке.',
  /** Колледжей региона нет в справочнике: говорим, где они есть, и что план работает без них. */
  noColleges: (coveredRegions) => [
    'Колледжей этого региона в справочнике пока нет.',
    coveredRegions.length ? `Сейчас собраны колледжи: ${coveredRegions.join(', ')}.` : null,
    'Для своего региона смотрите сайт регионального министерства образования и сайты колледжей. Даты плана, напоминания и сравнение путей работают для любого региона.',
  ].filter(Boolean).join('\n\n'),
  programNotFound: 'Этой программы больше нет в справочнике — данные обновились. Откройте список заново: /colleges',
  itemNotFound: 'Этого пункта больше нет в плане — возможно, даты обновились. Откройте план заново: /plan',
  shareIntro: 'Отправьте план подростку или второму родителю: нажмите «Отправить в MAX» и выберите чат — или просто перешлите следующее сообщение.',
  revokeConfirm: [
    'Отозвать ссылку на план?',
    '',
    'Старая ссылка перестанет открываться, а те, кто по ней подписался, перестанут получать напоминания. Ваш план и отметки останутся. Новую ссылку можно отправить в любой момент.',
  ].join('\n'),
  revokeNothing: 'Ссылки на план ещё нет — отзывать нечего.',
  sharedIntro: 'С вами поделились планом выбора пути после 9 класса. Включите напоминания — бот напишет перед важными датами.',
  sharedOwn: 'Это ваш план — так его увидит тот, кому вы отправили ссылку.',
  sharedInvalid: 'Ссылка на план недействительна: её отозвали или в ней ошибка. Попросите прислать новую или соберите свой план: /start',
  followOn: 'Готово! Напоминания по этому плану будут приходить сюда, в чат с ботом.',
  followOff: 'Напоминания по этому плану выключены.',
  deleteCancelled: 'Удаление отменено, данные на месте.',
  remindersOn: 'Напоминания включены. Напишу за несколько дней до важных дат в 10:00 по времени вашего региона.',
  remindersOff: 'Напоминания выключены. Включить снова: /reminders',
};

const PATH_ICONS = { school10: '🎓', college: '🛠' };
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const bullets = (lines) => lines.map((line) => `• ${line}`);

/** Сравнение путей для чата — из data/content.json, как на экране «Пути» в мини-приложении. */
export function pathsText(content) {
  const blocks = content.paths.map((path) => [
    `${PATH_ICONS[path.id] ?? '•'} ${path.title} — ${lowerFirst(path.subtitle)}`,
    `Срок: ${path.duration}`,
    'Экзамены:',
    ...bullets(path.exams),
    `Как поступают: ${path.admission}`,
    'Плюсы:',
    ...bullets(path.pros),
    'Минусы:',
    ...bullets(path.cons),
    `Дальше: ${path.next}`,
  ].join('\n'));
  return [
    '10–11 класс или колледж: чем отличаются пути',
    ...blocks,
    'Подробнее, с калькулятором среднего балла и колледжами региона, — в мини-приложении.',
    content.disclaimer,
  ].join('\n\n');
}

export function summaryText({
  region, city, grade, interests, path, remindersEnabled,
}) {
  return [
    'Готово! План собран.',
    '',
    `Регион: ${region.name}${region.isDemo ? ' (демо-данные)' : ''}`,
    `Город: ${city ?? 'любой'}`,
    `Класс: ${grade}`,
    `Интересы: ${interests.length ? interests.map((item) => item.title).join(', ') : 'пока не выбраны'}`,
    `Путь: ${PATH_TITLES[path]}`,
    region.twoOgeExperiment ? '\nВ регионе идёт эксперимент: для поступления в колледж можно сдать ОГЭ только по русскому языку и математике. Для 10 класса нужны четыре экзамена.' : null,
    region.id === OTHER_REGION_ID ? '\nДля вашего региона в плане федеральные сроки. Напоминания приходят в 10:00 по московскому времени.' : null,
    '',
    remindersEnabled ? 'Напоминания о ключевых датах включены.' : 'Напоминания выключены.',
  ].filter((line) => line !== null).join('\n');
}

function planItemLine(item) {
  const date = item.dateEnd ? `${formatDate(item.dateStart)} — ${formatDate(item.dateEnd)}` : formatDate(item.dateStart);
  let status = '';
  if (item.done) status = ' ✅';
  else if (item.status === 'current') status = ' (идёт сейчас)';
  else if (item.daysLeft === 0) status = ' (сегодня)';
  else if (item.daysLeft > 0) status = ` (${untilText(item.daysLeft)})`;
  const approximate = item.isApproximate ? ', ориентировочно' : '';
  return `• ${date}${approximate} — ${item.title}${status}`;
}

/**
 * План текстом для чата: работает и без мини-приложения.
 * @param {object} plan ответ planService.getPlan
 * @param {{ limit?: number }} [options] сколько ближайших пунктов показать; без limit — все непрошедшие
 */
export function planText(plan, { limit } = {}) {
  const header = `План на ${planPeriodLabel(plan)} · ${plan.region.name} · ${PATH_TITLES[plan.profile.path]}`;
  const upcoming = plan.items.filter((item) => item.status !== 'past');

  if (upcoming.length === 0) {
    return plan.isAdvance
      ? `${header}\n\nДаты 9 класса (${plan.academicYear}) ещё не опубликованы — добавим их, как только они появятся, и пришлём напоминания. А пока можно сравнить пути и посчитать средний балл: оценки по предметам, которые заканчиваются в 8 классе, тоже войдут в аттестат.`
      : `${header}\n\nВсе даты этого учебного года уже прошли.`;
  }

  const shown = limit ? upcoming.slice(0, limit) : upcoming;
  const lines = [header, ''];
  if (plan.isAdvance) {
    lines.push(`Сейчас — шаги 8 класса. Даты 9 класса (${plan.academicYear}) добавим, когда их опубликуют, и пришлём напоминания.`, '');
  }
  lines.push(limit ? 'Ближайшие даты:' : 'Даты года:', ...shown.map(planItemLine));
  const rest = upcoming.length - shown.length;
  if (rest > 0) lines.push(`…и ещё ${rest}`);
  const done = plan.items.filter((item) => item.done).length;
  lines.push('', `Выполнено: ${done} из ${plan.items.length}.`);
  return lines.join('\n');
}

/** Подпись кнопки пункта плана: «10 фев — Итоговое собеседование…» */
export function planItemLabel(item, maxLength = 48) {
  const label = `${item.done ? '✅ ' : ''}${formatShortDate(item.dateStart)} — ${item.title}`;
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function itemStatusText(item) {
  if (item.done) return '✅ Выполнено';
  if (item.status === 'past') return 'Срок прошёл';
  if (item.status === 'current') return 'Идёт сейчас';
  if (item.daysLeft === 0) return 'Сегодня';
  if (item.daysLeft > 0) return capitalize(untilText(item.daysLeft));
  return null;
}

/** Карточка пункта плана: дата, статус, что сделать и откуда это известно. */
export function planItemCard(item) {
  const date = item.dateEnd ? `${formatDate(item.dateStart)} — ${formatDate(item.dateEnd)}` : formatDate(item.dateStart);
  const status = itemStatusText(item);
  let source;
  if (item.scope === 'recommendation') source = 'Совет сервиса.';
  else if (item.sourceTitle || item.sourceUrl) {
    source = `Источник: ${item.sourceTitle ?? 'по ссылке ниже'}${item.checkedAt ? `, проверено ${formatCheckedAt(item.checkedAt)}` : ', дата не проверена'}.`;
  } else source = 'Источник не указан.';
  return [
    `📌 ${item.title}`,
    `${date}${item.isApproximate ? ' (ориентировочно)' : ''}${status ? ` · ${status}` : ''}`,
    '',
    item.description,
    '',
    source,
  ].join('\n');
}

export function reminderText({ keyDate, anchor, daysBefore }) {
  const date = anchor === 'end' ? (keyDate.dateEnd ?? keyDate.dateStart) : keyDate.dateStart;
  let when;
  if (anchor === 'end') {
    when = daysBefore === 0 ? `Сегодня последний день (${formatDate(date)})` : `До окончания — ${daysText(daysBefore)} (до ${formatDate(date)})`;
  } else if (daysBefore === 0) {
    when = keyDate.kind === 'period' ? `Начинается сегодня (${formatDate(date)})` : `Сегодня, ${formatDate(date)}`;
  } else if (daysBefore === 1) {
    when = `Завтра, ${formatDate(date)}`;
  } else {
    when = `Через ${daysText(daysBefore)} — ${formatDate(date)}`;
  }
  const approximate = keyDate.isApproximate ? ' (дата ориентировочная)' : '';
  return `⏰ ${keyDate.title}\n${when}${approximate}\n\n${keyDate.description}`;
}
