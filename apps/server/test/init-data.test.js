import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { signInitData, validateInitData } from '../src/api/init-data.js';

const token = 'bot-token';
const now = Date.parse('2026-09-16T10:00:00Z');
const authDate = Math.floor(now / 1000) - 60;

function sample(extra = {}) {
  return signInitData({
    auth_date: String(authDate),
    query_id: 'q-1',
    user: { id: 67890, first_name: 'Max', last_name: 'User', username: null, language_code: 'ru', photo_url: null },
    chat: { id: 12345, type: 'DIALOG' },
    ...extra,
  }, token);
}

test('подпись совпадает с алгоритмом из документации MAX', () => {
  // Пример из документации: строка launch_params и ключ HMAC_SHA256("WebAppData", token)
  const launchParams = 'auth_date=1771409719\nchat={"id":12345,"type":"DIALOG"}\nip=192.168.0.1\nquery_id=4c0ab423-342b-4e45-aea4-2747dbc500cd\nuser={"id":67890,"first_name":"Max","last_name":"User","username":null,"language_code":"ru","photo_url":null}';
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(launchParams).digest('hex');
  const initData = [
    'chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D',
    'ip=192.168.0.1',
    'user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D',
    'query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd',
    'auth_date=1771409719',
    `hash=${hash}`,
  ].join('&');

  const result = validateInitData(initData, token, { now: 1771409719 * 1000 + 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.user.id, 67890);
});

test('корректные данные проходят проверку и отдают start_param', () => {
  const result = validateInitData(sample({ start_param: 'plan_abc' }), token, { now });
  assert.equal(result.ok, true);
  assert.equal(result.user.id, 67890);
  assert.equal(result.startParam, 'plan_abc');
});

test('изменённые данные отклоняются', () => {
  const tampered = sample().replace('67890', '11111');
  assert.deepEqual(validateInitData(tampered, token, { now }), { ok: false, reason: 'bad_signature' });
});

test('чужой токен бота отклоняется', () => {
  assert.equal(validateInitData(sample(), 'other-token', { now }).reason, 'bad_signature');
});

test('устаревшие данные отклоняются', () => {
  const result = validateInitData(sample(), token, { now: now + 2 * 86400 * 1000, maxAgeSeconds: 86400 });
  assert.equal(result.reason, 'expired');
});

test('пустые и повреждённые данные отклоняются', () => {
  assert.equal(validateInitData('', token).reason, 'missing');
  assert.equal(validateInitData(undefined, token).reason, 'missing');
  assert.equal(validateInitData('garbage', token).reason, 'malformed');
  assert.equal(validateInitData('a=1&b=2', token).reason, 'no_hash');
  assert.equal(validateInitData(`${sample()}&hash=abc`, token).reason, 'no_hash');
});
