import { PATH_TITLES } from '@posle9/core';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 2027-03-01 → «1 марта» */
export function formatDate(date) {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

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
  askGrade: `Шаг 3 из ${TOTAL_STEPS}. В каком классе сейчас подросток?`,
  askInterests: `Шаг 4 из ${TOTAL_STEPS}. Что интересно подростку? Можно выбрать несколько, затем нажмите «Готово».`,
  askPath: `Шаг 5 из ${TOTAL_STEPS}. К какому пути склоняется семья?`,
  surveyExpired: 'Этот вопрос устарел. Начнём заново?',
  help: [
    'Что я умею:',
    '/start — ответить на вопросы и собрать план',
    '/plan — ближайшие даты плана прямо в чате',
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
  deleteCancelled: 'Удаление отменено, данные на месте.',
  remindersOn: 'Напоминания включены. Напишу за несколько дней до важных дат в 10:00 по времени вашего региона.',
  remindersOff: 'Напоминания выключены. Включить снова: /reminders',
};

export function summaryText({ region, city, grade, interests, path, remindersEnabled }) {
  return [
    'Готово! План собран.',
    '',
    `Регион: ${region.name}${region.isDemo ? ' (демо-данные)' : ''}`,
    `Город: ${city ?? 'любой'}`,
    `Класс: ${grade}`,
    `Интересы: ${interests.length ? interests.map((item) => item.title).join(', ') : 'пока не выбраны'}`,
    `Путь: ${PATH_TITLES[path]}`,
    region.twoOgeExperiment ? '\nВ регионе идёт эксперимент: для поступления в колледж можно сдать ОГЭ только по русскому языку и математике. Для 10 класса нужны четыре экзамена.' : null,
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
  else if (item.daysLeft > 0) status = ` (через ${item.daysLeft} дн.)`;
  const approximate = item.isApproximate ? ', ориентировочно' : '';
  return `• ${date}${approximate} — ${item.title}${status}`;
}

/**
 * План текстом для чата: работает и без мини-приложения.
 * @param {object} plan ответ planService.getPlan
 * @param {{ limit?: number }} [options] сколько ближайших пунктов показать; без limit — все непрошедшие
 */
export function planText(plan, { limit } = {}) {
  const header = `План на ${plan.academicYear} · ${plan.region.name} · ${PATH_TITLES[plan.profile.path]}`;
  const upcoming = plan.items.filter((item) => item.status !== 'past');

  if (upcoming.length === 0) {
    return plan.isAdvance
      ? `${header}\n\nЭто план на 9 класс. Даты ${plan.academicYear} учебного года ещё не опубликованы — добавим их, как только они появятся, и пришлём напоминания. А пока можно сравнить пути и посчитать средний балл: оценки по предметам, которые заканчиваются в 8 классе, тоже войдут в аттестат.`
      : `${header}\n\nВсе даты этого учебного года уже прошли.`;
  }

  const shown = limit ? upcoming.slice(0, limit) : upcoming;
  const lines = [header, ''];
  if (plan.isAdvance) {
    lines.push('Это план на 9 класс — следующий учебный год.', '');
  }
  lines.push(limit ? 'Ближайшие даты:' : 'Даты года:', ...shown.map(planItemLine));
  const rest = upcoming.length - shown.length;
  if (rest > 0) lines.push(`…и ещё ${rest}`);
  const done = plan.items.filter((item) => item.done).length;
  lines.push('', `Выполнено: ${done} из ${plan.items.length}.`);
  return lines.join('\n');
}

export function reminderText({ keyDate, anchor, daysBefore }) {
  const date = anchor === 'end' ? (keyDate.dateEnd ?? keyDate.dateStart) : keyDate.dateStart;
  let when;
  if (anchor === 'end') {
    when = daysBefore === 0 ? `Сегодня последний день (${formatDate(date)})` : `До окончания — ${daysBefore} дн. (до ${formatDate(date)})`;
  } else if (daysBefore === 0) {
    when = keyDate.kind === 'period' ? `Начинается сегодня (${formatDate(date)})` : `Сегодня, ${formatDate(date)}`;
  } else if (daysBefore === 1) {
    when = `Завтра, ${formatDate(date)}`;
  } else {
    when = `Через ${daysBefore} дн. — ${formatDate(date)}`;
  }
  const approximate = keyDate.isApproximate ? ' (дата ориентировочная)' : '';
  return `⏰ ${keyDate.title}\n${when}${approximate}\n\n${keyDate.description}`;
}
