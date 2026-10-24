import { test } from 'node:test';
import assert from 'node:assert/strict';

import { programButtonLabel } from '../src/bot/colleges-chat.js';
import {
  followerMenuKeyboard, menuKeyboard, revokeConfirmKeyboard, sharedPlanKeyboard, summaryKeyboard,
} from '../src/bot/keyboards.js';
import { gradeStep, interestsStep, regionStep } from '../src/bot/survey.js';
import { weekStepCheckMessage } from '../src/bot/week-step-chat.js';
import { createTestApp } from './helpers.js';

// В ряду из двух кнопок на телефоне помещается около 14 символов подписи — длиннее MAX обрезает «…»
const HALF_WIDTH = 14;
const visible = (text) => text.replace(/^[^\p{L}\p{N}]+/u, '');
const token = 'A'.repeat(22);

test('в рядах по две кнопки подписи помещаются на экран телефона', () => {
  const ctx = createTestApp();
  const { reference } = ctx.repos;
  const allInterests = reference.listInterests();
  const keyboards = {
    'меню, напоминания включены': menuKeyboard({
      botUsername: 'bot', remindersEnabled: true, withReminderExample: true, withFamilyPlan: true, withExamAdvice: true,
    }),
    'меню, напоминания выключены': menuKeyboard({ botUsername: 'bot', remindersEnabled: false }),
    'меню подписчика': followerMenuKeyboard({ botUsername: 'bot', token, remindersEnabled: true }),
    'итог опроса': summaryKeyboard('bot', { withExamAdvice: true }),
    'план семьи': sharedPlanKeyboard({ botUsername: 'bot', token, isFollowing: false }),
    'регионы': regionStep(reference.listRegions()).keyboard,
    'интересы, все выбраны': interestsStep(allInterests, allInterests.map((interest) => interest.id)).keyboard,
    'класс': gradeStep().keyboard,
    'отзыв ссылки': revokeConfirmKeyboard(),
    'Получилось?': weekStepCheckMessage({ id: 1, step: { title: 'Шаг' } }).keyboard,
  };
  for (const [name, keyboard] of Object.entries(keyboards)) {
    for (const row of keyboard.payload.buttons) {
      if (row.length < 2) continue;
      for (const button of row) {
        assert.ok(visible(button.text).length <= HALF_WIDTH, `${name}: «${button.text}» не помещается в половину строки`);
      }
    }
  }
  ctx.db.close();
});

test('кнопка программы: короткое имя колледжа — одинаковые программы разных колледжей различимы', () => {
  const program = (shortName) => ({ specialtyTitle: 'Компьютерные системы и комплексы', college: { shortName } });
  const first = programButtonLabel(program('Авиационно-технический'), 1);
  const fifth = programButtonLabel(program('Радиомеханический'), 5);
  assert.equal(fifth, '5. Радиомеханический · Компьютерные …');
  assert.notEqual(first.slice(3), fifth.slice(3));
  assert.ok(first.length <= 37);
  assert.equal(programButtonLabel(program(null), 2, { favorite: true }), '★ 2. Компьютерные системы и комплексы', 'без короткого имени — как раньше');
});
