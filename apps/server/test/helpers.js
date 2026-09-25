import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/api/app.js';
import { signInitData } from '../src/api/init-data.js';
import { createContainer } from '../src/container.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const BOT_TOKEN = 'test-bot-token';
export const BOT_USERNAME = 'posle9_test_bot';

export function testConfig(overrides = {}) {
  return {
    isProduction: false,
    host: '127.0.0.1',
    port: 0,
    logLevel: 'silent',
    botToken: BOT_TOKEN,
    botEnabled: false,
    botUsername: BOT_USERNAME,
    databasePath: ':memory:',
    dataDir: path.join(repoRoot, 'data'),
    miniappDistDir: path.join(repoRoot, 'apps', 'miniapp', 'dist-missing'),
    academicYear: '2026/2027',
    reminderIntervalMs: 60_000,
    initDataMaxAgeSeconds: 86400,
    authDevBypass: false,
    adminUserIds: [],
    rateLimitPerMinute: 0,
    botRichText: false,
    appVersion: 'test',
    botRateLimitPerMinute: 0,
    ...overrides,
  };
}

/** Приложение на базе в памяти с фиксированным «сейчас». */
export function createTestApp({ now = '2026-09-16T09:00:00Z', config: configOverrides } = {}) {
  const clock = { now: new Date(now) };
  const config = testConfig(configOverrides);
  const container = createContainer(config, { clock: () => clock.now });
  const app = buildApp({ config, services: container.services, runtime: container.runtime, logger: false });
  return { app, clock, config, ...container };
}

export function authHeaders(userId, { startParam, authDate = Math.floor(Date.now() / 1000) } = {}) {
  const params = {
    auth_date: String(authDate),
    query_id: 'test-query',
    user: { id: userId, first_name: 'Тест', last_name: '', username: null, language_code: 'ru', photo_url: null },
  };
  if (startParam) params.start_param = startParam;
  return { 'x-max-init-data': signInitData(params, BOT_TOKEN) };
}
