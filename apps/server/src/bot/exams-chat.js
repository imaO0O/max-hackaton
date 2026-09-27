import { Keyboard } from '@maxhub/max-bot-api';
import {
  EXAM_ADVICE, EXAM_ADVICE_NOTE, EXAM_QUESTIONS, examChoiceFromPath, experimentListNote, isExamChoice, isProfessionAnswer,
  needsProfessionQuestion, OTHER_REGION_ID, PATH_TITLES, recommendExams,
} from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import { pickPrograms } from './colleges-chat.js';
import { startKeyboard } from './keyboards.js';
import { texts } from './texts.js';

/**
 * «2 или 4 ОГЭ?» в чате: два вопроса кнопками и рекомендация с объяснением.
 * Логика и тексты — из packages/core, те же, что в мини-приложении. Состояние не хранится:
 * второй вопрос задаётся только тем, кто выбрал колледж, поэтому его ответ однозначен.
 * Payload кнопок: oge:start, oge:c:<куда>, oge:p:<перечень>, oge:list.
 */

const MAX_LIST_PROGRAMS = 8;
const button = Keyboard.button;
const TITLE = '2 или 4 ОГЭ?';
const BACK_TO_MENU = [button.callback('← Меню', 'menu:show')];

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function registerExamsChat({ bot, users, reference, services }) {
  const userIdOf = (ctx) => ctx.user?.user_id;

  const show = (ctx, view, { edit }) => (edit
    ? ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } })
    : ctx.reply(view.text, { attachments: [view.keyboard] }));

  /** Профиль и регион семьи; null — опрос ещё не пройден. */
  function familyOf(userId) {
    const user = users.ensure(userId);
    if (!isProfileComplete(user)) return null;
    return { user, region: reference.getRegion(user.regionId) };
  }

  /** Программы региона из перечня эксперимента: сначала в городе семьи, если там нет — во всём регионе. */
  function listedPrograms({ user, region }) {
    const search = (city) => services.catalog.searchColleges({ regionId: region.id, city, experimentOnly: true })
      .flatMap((college) => college.programs.map((program) => ({ ...program, college })));
    const inCity = user.city ? search(user.city) : [];
    if (inCity.length) return { programs: inCity, note: null };
    const inRegion = search(null);
    return { programs: inRegion, note: user.city && inRegion.length ? `В городе ${user.city} программ из перечня нет — показываю весь регион.` : null };
  }

  function choiceView({ user }) {
    const rows = EXAM_QUESTIONS.choice.options.map((option) => [button.callback(option.title, `oge:c:${option.id}`)]);
    rows.push(BACK_TO_MENU);
    return {
      text: [TITLE, '', EXAM_QUESTIONS.choice.text, `В ответах опроса: ${PATH_TITLES[user.path] ?? 'не указано'}.`].join('\n'),
      keyboard: Keyboard.inlineKeyboard(rows),
    };
  }

  function professionView(userId, family) {
    const { region } = family;
    const list = region.experimentList;
    const lines = [TITLE, '', EXAM_QUESTIONS.profession.text];
    if (list) {
      const { programs } = listedPrograms(family);
      lines.push(`В справочнике отмечены программы из перечня ${list.year} года: ${programs.length}. Их можно посмотреть кнопкой ниже.`);
      // Избранное подсказывает ответ: семья уже присматривалась к этим программам
      const favorites = services.catalog.listFavorites(userId).filter((program) => program.college.regionId === region.id);
      const listed = favorites.filter((program) => program.inExperimentList);
      const notListed = favorites.filter((program) => !program.inExperimentList);
      if (listed.length) lines.push('', `В избранном из перечня: ${listed.map((program) => program.specialtyTitle).join('; ')}.`);
      if (notListed.length) lines.push('', `В избранном не из перечня: ${notListed.map((program) => program.specialtyTitle).join('; ')}.`);
    } else {
      lines.push('Перечень колледжей и профессий публикует региональное министерство образования.');
    }
    const rows = EXAM_QUESTIONS.profession.options.map((option) => [button.callback(option.title, `oge:p:${option.id}`)]);
    if (list) rows.push([button.callback('📋 Программы из перечня', 'oge:list')]);
    rows.push([button.callback('← Назад', 'oge:start')]);
    return { text: lines.join('\n'), keyboard: Keyboard.inlineKeyboard(rows) };
  }

  function resultView(userId, { user, region }, { choice, profession }) {
    const result = recommendExams({
      regionId: user.regionId, twoOgeExperiment: region?.twoOgeExperiment ?? false, choice, profession,
    });
    services.analytics.track(EVENTS.EXAM_ADVICE, userId, { reason: result.reason, regionId: user.regionId });
    const advice = EXAM_ADVICE[result.reason];
    const list = region?.experimentList ?? null;
    const lines = [advice.title, '', advice.text];
    if (list && ['college_listed', 'college_unknown'].includes(result.reason)) lines.push('', experimentListNote(list.year));
    lines.push('', EXAM_ADVICE_NOTE);

    const rows = [];
    if (list && ['college_listed', 'college_unknown', 'keep_both'].includes(result.reason)) {
      rows.push([button.callback('📋 Программы из перечня', 'oge:list')]);
    }
    if (list?.sourceUrl) rows.push([button.link(`Перечень ${list.year}: источник`, list.sourceUrl)]);
    if (region?.twoOgeExperiment || !region) rows.push([button.callback('↺ Ответить заново', 'oge:start')]);
    rows.push(BACK_TO_MENU);
    return { text: lines.join('\n'), keyboard: Keyboard.inlineKeyboard(rows) };
  }

  function listView(family) {
    const list = family.region.experimentList;
    const { programs, note } = listedPrograms(family);
    if (!programs.length) {
      return {
        text: `Программ из перечня ${list.year} года в справочнике региона нет. Перечень публикует региональное министерство образования.`,
        keyboard: Keyboard.inlineKeyboard([[button.callback('← К подсказке', 'oge:start')], BACK_TO_MENU]),
      };
    }
    const shown = pickPrograms(programs, MAX_LIST_PROGRAMS);
    const lines = [`Программы из перечня ${list.year} года`, note];
    shown.forEach((program, index) => {
      if (index === 0 || shown[index - 1].college.id !== program.college.id) lines.push('', `🏫 ${program.college.name}`);
      lines.push(`${index + 1}. ${program.specialtyTitle}`);
    });
    lines.push(
      '',
      programs.length > shown.length ? `Показано ${shown.length} из ${programs.length}. Все — в мини-приложении, фильтр «Можно с двумя ОГЭ».` : null,
      `Колледж и профессия были в перечне ${list.year} года — перед подачей документов уточните в приёмной комиссии.`,
      'Нажмите на номер программы, чтобы открыть подробности.',
    );
    const rows = shown.map((program, index) => [button.callback(`${index + 1}. ${shorten(program.specialtyTitle, 34)}`, `p:${program.id}`)]);
    rows.push([button.callback('← К подсказке', 'oge:start')], BACK_TO_MENU);
    return { text: lines.filter((line) => line !== null).join('\n'), keyboard: Keyboard.inlineKeyboard(rows) };
  }

  const surveyView = () => ({ text: texts.needSurvey, keyboard: startKeyboard({ hasProfile: false }) });

  /** Начало: в регионе без эксперимента ответ один — сразу рекомендация, иначе первый вопрос. */
  async function sendExamAdvice(ctx, { edit = false } = {}) {
    const userId = userIdOf(ctx);
    const family = familyOf(userId);
    if (!family) return show(ctx, surveyView(), { edit });
    if (family.region && !family.region.twoOgeExperiment && family.region.id !== OTHER_REGION_ID) {
      return show(ctx, resultView(userId, family, { choice: examChoiceFromPath(family.user.path) }), { edit });
    }
    return show(ctx, choiceView(family), { edit });
  }

  bot.command('oge', (ctx) => sendExamAdvice(ctx));
  bot.action('oge:start', (ctx) => sendExamAdvice(ctx, { edit: true }));

  bot.action(/^oge:c:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const family = familyOf(userId);
    const choice = ctx.callback.payload.slice('oge:c:'.length);
    if (!family) return show(ctx, surveyView(), { edit: true });
    if (!isExamChoice(choice)) return sendExamAdvice(ctx, { edit: true });
    const needsProfession = needsProfessionQuestion({
      regionId: family.user.regionId, twoOgeExperiment: family.region?.twoOgeExperiment ?? false, choice,
    });
    return show(ctx, needsProfession ? professionView(userId, family) : resultView(userId, family, { choice }), { edit: true });
  });

  bot.action(/^oge:p:/, async (ctx) => {
    const userId = userIdOf(ctx);
    const family = familyOf(userId);
    const profession = ctx.callback.payload.slice('oge:p:'.length);
    if (!family) return show(ctx, surveyView(), { edit: true });
    if (!isProfessionAnswer(profession)) return sendExamAdvice(ctx, { edit: true });
    return show(ctx, resultView(userId, family, { choice: 'college', profession }), { edit: true });
  });

  bot.action('oge:list', async (ctx) => {
    const family = familyOf(userIdOf(ctx));
    if (!family) return show(ctx, surveyView(), { edit: true });
    if (!family.region?.experimentList) return sendExamAdvice(ctx, { edit: true });
    return show(ctx, listView(family), { edit: true });
  });

  return { sendExamAdvice };
}
