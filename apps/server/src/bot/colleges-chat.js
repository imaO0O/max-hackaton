import { Keyboard } from '@maxhub/max-bot-api';
import {
  DATA_STATUS, DATA_STATUS_ICONS, DATA_STATUS_TITLES, dataStatusExplanation, dataStatusIcon, localDateString, programDataStatus,
  STUDY_FORMS,
} from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import { openAppKeyboard, reportButtonRow, startKeyboard } from './keyboards.js';
import { texts } from './texts.js';

/**
 * Колледжи в чате: программы по интересам и городу из ответов, карточка программы с источником
 * и избранным. Payload кнопок короткий (у кнопок есть предел длины): p:<id>, pf:<id>, pu:<id>.
 */

const MAX_PROGRAMS = 8;
const button = Keyboard.button;

/** Сегодняшняя дата для статуса данных — по московскому времени, как в справочнике. */
const todayMsk = (clock) => localDateString(clock(), 3);

const formatScore = (value) => (value === null || value === undefined ? 'нет данных' : value.toFixed(2).replace('.', ','));

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Подпись кнопки программы: номер, короткое имя колледжа и начало названия программы —
 * одинаковые программы разных колледжей различимы. Без короткого имени (демо) — номер и программа.
 */
export function programButtonLabel(program, number, { favorite = false } = {}) {
  const college = program.college?.shortName;
  const title = college ? `${college} · ${program.specialtyTitle}` : program.specialtyTitle;
  return `${favorite ? '★ ' : ''}${number}. ${shorten(title, 34)}`;
}

/** Номер программы в списке — он же на кнопке, чтобы подпись кнопки была короткой и не обрезалась на телефоне. */
function programLine(program, number, info) {
  const score = program.passingScore === null ? 'балл: нет данных' : `балл ${program.scoreYear ?? ''}: ${formatScore(program.passingScore)}`;
  const places = program.budgetPlaces ? `, бюджет ${program.budgetPlaces}` : '';
  return `${number}. ${program.specialtyTitle} — ${STUDY_FORMS[program.form].toLowerCase()}, ${score.replace(/ +:/, ':')}${places} ${dataStatusIcon(info)}`;
}

/**
 * До limit программ так, чтобы в списке были разные колледжи: по очереди из каждого.
 * Внутри колледжа и среди колледжей — сначала с известным баллом, по нему семье проще сориентироваться.
 */
export function pickPrograms(programs, limit) {
  const sorted = [...programs].sort((a, b) => (a.passingScore === null) - (b.passingScore === null)
    || a.college.name.localeCompare(b.college.name, 'ru'));
  const queues = new Map();
  for (const program of sorted) {
    if (!queues.has(program.college.id)) queues.set(program.college.id, []);
    queues.get(program.college.id).push(program);
  }
  const picked = [];
  while (picked.length < limit && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      if (queue.length > 0 && picked.length < limit) picked.push(queue.shift());
    }
  }
  // Для списка — группами по колледжам, в порядке первого появления
  const order = [...new Set(picked.map((program) => program.college.id))];
  return order.flatMap((collegeId) => picked.filter((program) => program.college.id === collegeId));
}

function programCard(program, isFavorite, today) {
  const status = dataStatusExplanation(programDataStatus(program, { today }));
  const lines = [
    `🏫 ${program.college.name}`,
    `${program.specialtyCode} ${program.specialtyTitle}`,
    '',
    `Форма: ${STUDY_FORMS[program.form]}`,
    `Срок: ${program.duration ?? 'нет данных'}`,
    `Бюджетных мест: ${program.budgetPlaces ?? 'нет данных'}`,
    `Проходной балл${program.scoreYear ? ` ${program.scoreYear}` : ''}: ${formatScore(program.passingScore)}`,
  ];
  if (program.entranceTest) lines.push(`Дополнительно: ${program.entranceTest}`);
  lines.push(
    `Адрес: ${program.college.address ?? program.college.city}${program.college.hasDormitory ? ', есть общежитие' : ''}`,
    '',
    `${dataStatusIcon(programDataStatus(program, { today }))} ${status.title}`,
    ...status.lines,
  );
  if (program.passingScore !== null) lines.push('', 'Балл — ориентир по прошлому году, а не прогноз поступления.');
  if (isFavorite) lines.push('', '★ В избранном — видно в мини-приложении и у подростка в плане семьи.');
  return lines.join('\n');
}

export function registerCollegesChat({
  bot, users, reference, services, runtime, clock = () => new Date(),
}) {
  const userIdOf = (ctx) => ctx.user?.user_id;

  /** Программы под ответы семьи. Если по городу пусто — весь регион, если по интересам пусто — все сферы. */
  function findPrograms(user) {
    const attempts = [
      { city: user.city, interestIds: user.interests, note: null },
      { city: null, interestIds: user.interests, note: user.city ? `В городе ${user.city} таких программ нет — показываю весь регион.` : null },
      { city: null, interestIds: [], note: 'По выбранным интересам программ нет — показываю все сферы.' },
    ];
    for (const attempt of attempts) {
      const colleges = services.catalog.searchColleges({
        regionId: user.regionId, city: attempt.city, interestIds: attempt.interestIds,
      });
      const programs = colleges.flatMap((college) => college.programs.map((program) => ({ ...program, college })));
      if (programs.length) return { programs, note: attempt.note };
    }
    return { programs: [], note: null };
  }

  function listView(userId) {
    const user = users.ensure(userId);
    const { programs, note } = findPrograms(user);
    const region = reference.getRegion(user.regionId);
    if (!programs.length) {
      // Где колледжи уже собраны — чтобы было понятно, что это не ошибка, а охват пилота
      const covered = reference.listRegions()
        .filter((item) => !item.isDemo && reference.listCities(item.id).length > 0)
        .map((item) => item.name);
      return {
        text: texts.noColleges(covered),
        keyboard: openAppKeyboard(runtime.botUsername, [[button.callback('← Меню', 'menu:show')]]),
      };
    }
    const shown = pickPrograms(programs, MAX_PROGRAMS);
    const favorites = new Set(services.catalog.listFavorites(userId).map((program) => program.id));
    // Название колледжа — один раз над его программами
    const lines = [];
    shown.forEach((program, index) => {
      if (index === 0 || shown[index - 1].college.id !== program.college.id) lines.push('', `🏫 ${program.college.name}`);
      lines.push(programLine(program, index + 1, programDataStatus(program, { today: todayMsk(clock) })));
    });
    // Легенда — только для значков, которые есть в списке
    const infos = shown.map((program) => programDataStatus(program, { today: todayMsk(clock) }));
    const present = [...new Set(infos.map((info) => info.status))];
    const legend = [
      ...[DATA_STATUS.CONFIRMED, DATA_STATUS.INCOMPLETE, DATA_STATUS.STALE, DATA_STATUS.UNVERIFIED, DATA_STATUS.DEMO]
        .filter((item) => infos.some((info) => info.status === item && !info.minor))
        .map((item) => `${DATA_STATUS_ICONS[item]} ${DATA_STATUS_TITLES[item].toLowerCase()}`),
      ...(infos.some((info) => info.minor) ? ['ℹ️ колледж не публикует прошлогодний балл'] : []),
    ].join(', ');
    const text = [
      `Колледжи: ${region?.name ?? ''}${user.city ? `, ${user.city}` : ''}`,
      note,
      ...lines,
      '',
      programs.length > shown.length
        ? `Показано ${shown.length} из ${programs.length}. Все программы, фильтры и сравнение — в мини-приложении.`
        : 'Сравнить программы рядом можно в мини-приложении.',
      `${legend}${present.some((item) => item !== DATA_STATUS.CONFIRMED && item !== DATA_STATUS.DEMO) ? ' — уточните в приёмной комиссии' : ''}.`,
      'Нажмите на номер программы, чтобы открыть подробности и добавить в избранное.',
    ].filter((line) => line !== null).join('\n');
    const rows = shown.map((program, index) => [button.callback(
      programButtonLabel(program, index + 1, { favorite: favorites.has(program.id) }),
      `p:${program.id}`,
    )]);
    rows.push([button.callback('← Меню', 'menu:show')]);
    return { text, keyboard: openAppKeyboard(runtime.botUsername, rows) };
  }

  function cardView(userId, programId) {
    const program = reference.getProgram(programId);
    if (!program) return null;
    const isFavorite = services.catalog.listFavorites(userId).some((item) => item.id === programId);
    const rows = [[isFavorite
      ? button.callback('Убрать из избранного', `pu:${programId}`)
      : button.callback('☆ В избранное', `pf:${programId}`)]];
    if (program.sourceUrl) {
      const confirmed = programDataStatus(program, { today: todayMsk(clock) }).status === DATA_STATUS.CONFIRMED;
      rows.push([button.link(confirmed ? 'Источник' : 'Приёмная комиссия и источник', program.sourceUrl)]);
    }
    rows.push(reportButtonRow('p', programId));
    rows.push([button.callback('← Все программы', 'colleges:show')]);
    return { text: programCard(program, isFavorite, todayMsk(clock)), keyboard: Keyboard.inlineKeyboard(rows) };
  }

  const surveyView = () => ({ text: texts.needSurvey, keyboard: startKeyboard({ hasProfile: false }) });

  async function show(ctx, view, { edit }) {
    return edit
      ? ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } })
      : ctx.reply(view.text, { attachments: [view.keyboard] });
  }

  async function sendColleges(ctx, { edit = false } = {}) {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) return show(ctx, surveyView(), { edit });
    services.analytics.track(EVENTS.COLLEGES_VIEWED_IN_CHAT, userId);
    return show(ctx, listView(userId), { edit });
  }

  bot.action('colleges:show', (ctx) => sendColleges(ctx, { edit: true }));

  bot.action(/^p:/, async (ctx) => {
    const view = cardView(userIdOf(ctx), ctx.callback.payload.slice(2));
    if (!view) return ctx.answerOnCallback({ message: { text: texts.programNotFound } });
    return show(ctx, view, { edit: true });
  });

  bot.action(/^p[fu]:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [action, programId] = [ctx.callback.payload.slice(0, 2), ctx.callback.payload.slice(3)];
    if (!reference.getProgram(programId)) return ctx.answerOnCallback({ message: { text: texts.programNotFound } });
    if (action === 'pf') {
      services.catalog.addFavorite(userId, programId);
      services.analytics.track(EVENTS.FAVORITE_ADDED, userId, { programId, from: 'chat' });
    } else {
      services.catalog.removeFavorite(userId, programId);
    }
    return show(ctx, cardView(userId, programId), { edit: true });
  });

  return { sendColleges };
}
