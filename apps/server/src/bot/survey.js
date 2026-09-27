import { Keyboard } from '@maxhub/max-bot-api';
import { GRADE_VALUES, PATH_TITLES, PATH_VALUES } from '@posle9/core';

import { texts } from './texts.js';

/**
 * Опрос в боте. Состояние хранится в базе (users.survey_state), поэтому переживает перезапуск.
 * Payload callback-кнопок: survey:<действие>[:<значение>].
 */

export const ANY_CITY = '*';

const button = Keyboard.button;

// Общие клавиатуры бота — в keyboards.js; реэкспорт для прежних импортов
export { openAppKeyboard, startKeyboard } from './keyboards.js';

/** Кнопка «Назад» возвращает к предыдущему шагу, не сбрасывая ответы. */
const backRow = (step) => [button.callback('← Назад', `survey:back:${step}`)];

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/**
 * Регионы по порядку справочника. Пилотный регион с колледжами, «Другой регион» и демо — по одному в строке,
 * регионы эксперимента без колледжей в справочнике — по два, чтобы список не растягивался на весь экран.
 */
export function regionStep(regions) {
  const rows = [];
  let pair = [];
  for (const region of regions) {
    const regionButton = button.callback(region.name, `survey:region:${region.id}`);
    if (region.hasColleges || region.isDemo || !region.twoOgeExperiment) {
      if (pair.length) rows.push(pair);
      pair = [];
      rows.push([regionButton]);
    } else {
      pair.push(regionButton);
      if (pair.length === 2) {
        rows.push(pair);
        pair = [];
      }
    }
  }
  if (pair.length) rows.push(pair);
  return { text: texts.askRegion, keyboard: Keyboard.inlineKeyboard(rows) };
}

export function cityStep(cities) {
  return {
    // Честно о справочнике: «Любой город региона» — если своего города нет в списке
    text: `${texts.askCity}\n\n${texts.cityHint}`,
    keyboard: Keyboard.inlineKeyboard([
      ...cities.map((city, index) => [button.callback(city, `survey:city:${index}`)]),
      [button.callback('Любой город региона', `survey:city:${ANY_CITY}`)],
      backRow('region'),
    ]),
  };
}

/** backTo — куда ведёт «Назад»: к городу или сразу к региону, если городов в справочнике нет. */
export function gradeStep(backTo = 'city') {
  return {
    text: texts.askGrade,
    keyboard: Keyboard.inlineKeyboard([
      GRADE_VALUES.slice().reverse().map((grade) => button.callback(`${grade} класс`, `survey:grade:${grade}`)),
      backRow(backTo),
    ]),
  };
}

export function interestsStep(interests, selected) {
  const chosen = new Set(selected);
  const buttons = interests.map((interest) => button.callback(
    `${chosen.has(interest.id) ? '✅ ' : ''}${interest.title}`,
    `survey:interest:${interest.id}`,
  ));
  return {
    text: texts.askInterests,
    keyboard: Keyboard.inlineKeyboard([
      ...chunk(buttons, 2),
      [button.callback(chosen.size ? `Готово (${chosen.size})` : 'Пока не знаем', 'survey:interests-done')],
      backRow('grade'),
    ]),
  };
}

export function pathStep() {
  return {
    text: texts.askPath,
    keyboard: Keyboard.inlineKeyboard([
      ...PATH_VALUES.map((path) => [button.callback(PATH_TITLES[path], `survey:path:${path}`)]),
      backRow('interests'),
    ]),
  };
}

export function parseSurveyPayload(payload) {
  const match = /^survey:([a-z-]+)(?::(.+))?$/.exec(payload ?? '');
  return match ? { action: match[1], value: match[2] ?? null } : null;
}
