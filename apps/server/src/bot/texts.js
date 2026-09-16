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
    '/plan — открыть план в мини-приложении',
    '/reminders — включить или выключить напоминания',
    '',
    'Сервис не подаёт заявления и не рассчитывает шансы на поступление. Сроки и условия сверяйте в школе и в правилах приёма колледжа.',
  ].join('\n'),
  needSurvey: 'Сначала ответьте на 5 вопросов — это займёт минуту.',
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
    region.twoOgeExperiment ? '\nВ регионе идёт эксперимент: на ОГЭ сдаются только русский язык и математика.' : null,
    '',
    remindersEnabled ? 'Напоминания о ключевых датах включены.' : 'Напоминания выключены.',
  ].filter((line) => line !== null).join('\n');
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
