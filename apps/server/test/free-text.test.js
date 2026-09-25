import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectTopic } from '../src/bot/free-text.js';

test('частые вопросы родителей узнаются по теме', () => {
  const cases = {
    'Когда подавать заявление на ОГЭ?': 'plan',
    'когда отбор в 10 класс': 'plan',
    'Какие сроки приёма в колледж': 'plan',
    'Что выбрать: 10 класс или колледж?': 'paths',
    'остаться в школе или уйти после 9': 'paths',
    'какие колледжи есть в Казани': 'colleges',
    'Проходной балл на программирование': 'colleges',
    'как посчитать средний балл аттестата': 'grades',
    'Напоминания подростку приходят?': 'reminders',
    'выключи уведомления': 'reminders',
    'как отправить план сыну': 'share',
    'удалить мои данные': 'delete',
    'Что ты умеешь?': 'help',
    '/unknown': 'help',
    'Спасибо!': 'thanks',
    'Добрый день': 'greeting',
    'Привет': 'greeting',
    'Ёлки-палки': null,
    '': null,
  };
  for (const [text, topic] of Object.entries(cases)) {
    assert.equal(detectTopic(text), topic, text);
  }
  assert.equal(detectTopic(undefined), null, 'стикер или фото без текста');
});
