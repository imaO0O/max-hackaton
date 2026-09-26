import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEBHOOK_PATH, webhookSecretFromToken } from './bot/webhook.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..', '..');

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(name, value, fallback, { min = 0 } = {}) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`Переменная ${name} должна быть целым числом не меньше ${min}`);
  }
  return parsed;
}

function parseIdList(name, value) {
  if (!value) return [];
  const ids = value.split(',').map((item) => Number(item.trim())).filter((item) => item !== 0);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 0)) {
    throw new Error(`${name} — список ID пользователей MAX через запятую`);
  }
  return ids;
}

/** Читает и проверяет настройки из переменных окружения. */
export function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const academicYear = env.ACADEMIC_YEAR || null;
  if (academicYear && !/^\d{4}\/\d{4}$/.test(academicYear)) {
    throw new Error('ACADEMIC_YEAR должен быть в формате 2026/2027');
  }

  const config = {
    isProduction,
    host: env.HOST || '0.0.0.0',
    port: parseInteger('PORT', env.PORT, 8080, { min: 1 }),
    logLevel: env.LOG_LEVEL || 'info',
    botToken: env.BOT_TOKEN || '',
    botEnabled: parseBoolean(env.BOT_ENABLED, true),
    botUsername: env.BOT_USERNAME || null,
    databasePath: env.DATABASE_PATH || path.join(repoRoot, 'storage', 'posle9.sqlite'),
    dataDir: env.DATA_DIR || path.join(repoRoot, 'data'),
    miniappDistDir: env.MINIAPP_DIST_DIR || path.join(repoRoot, 'apps', 'miniapp', 'dist'),
    academicYear,
    reminderIntervalMs: parseInteger('REMINDER_INTERVAL_SECONDS', env.REMINDER_INTERVAL_SECONDS, 300, { min: 10 }) * 1000,
    initDataMaxAgeSeconds: parseInteger('INIT_DATA_MAX_AGE_SECONDS', env.INIT_DATA_MAX_AGE_SECONDS, 86400, { min: 60 }),
    authDevBypass: !isProduction && parseBoolean(env.AUTH_DEV_BYPASS, false),
    adminUserIds: parseIdList('ADMIN_USER_IDS', env.ADMIN_USER_IDS),
    botRichText: parseBoolean(env.BOT_RICH_TEXT, true),
    rateLimitPerMinute: parseInteger('RATE_LIMIT_PER_MINUTE', env.RATE_LIMIT_PER_MINUTE, 300, { min: 0 }),
    appVersion: env.APP_VERSION || 'local',
    botRateLimitPerMinute: parseInteger('BOT_RATE_LIMIT_PER_MINUTE', env.BOT_RATE_LIMIT_PER_MINUTE, 40, { min: 0 }),
    // Чьим заголовкам X-Forwarded-For верить: по умолчанию — локальным адресам и сети Docker, где работает Caddy.
    // Запрос напрямую из интернета не может подменить свой IP и обойти ограничение частоты запросов
    trustProxy: env.TRUST_PROXY || 'loopback,uniquelocal',
  };

  config.warnings = [];

  // Без токена сервер не падает, а работает без бота: так проект запускается одной командой
  // и без выданного токена (справочники, мини-приложение, /api/health). /api/health покажет "bot":"disabled"
  if (config.botEnabled && !config.botToken) {
    config.botEnabled = false;
    config.warnings.push('BOT_TOKEN не задан: бот и напоминания выключены. Укажите токен в .env и перезапустите сервис');
  }

  // Как бот получает события: polling (по умолчанию) или webhook — рекомендованный MAX для production.
  // Адрес Webhook — BOT_WEBHOOK_URL или домен из DOMAIN (тот же, что у HTTPS-прокси).
  const botMode = (env.BOT_MODE || 'polling').toLowerCase();
  if (!['polling', 'webhook'].includes(botMode)) {
    throw new Error('BOT_MODE должен быть polling или webhook');
  }
  const webhookBase = env.BOT_WEBHOOK_URL || (env.DOMAIN ? `https://${env.DOMAIN}` : '');
  config.botMode = botMode;
  config.botWebhookUrl = null;
  config.botWebhookSecret = env.BOT_WEBHOOK_SECRET || (config.botToken ? webhookSecretFromToken(config.botToken) : null);
  if (botMode === 'webhook') {
    if (!/^https:\/\/[^/\s]+/.test(webhookBase)) {
      config.botMode = 'polling';
      config.warnings.push('BOT_MODE=webhook: нужен HTTPS-адрес сервера в BOT_WEBHOOK_URL или DOMAIN — бот работает через Long Polling');
    } else {
      config.botWebhookUrl = `${webhookBase.replace(/\/+$/, '')}${WEBHOOK_PATH}`;
    }
  }
  if (config.botWebhookSecret && !/^[A-Za-z0-9_-]{5,256}$/.test(config.botWebhookSecret)) {
    throw new Error('BOT_WEBHOOK_SECRET: 5–256 символов, латиница, цифры, «_» и «-»');
  }
  if (!config.botToken && !config.authDevBypass) {
    config.warnings.push('BOT_TOKEN не задан: подпись мини-приложения проверить нельзя, личные разделы API будут отвечать 401');
  }
  if (env.AUTH_DEV_BYPASS === 'true' && isProduction) {
    config.warnings.push('AUTH_DEV_BYPASS игнорируется при NODE_ENV=production');
  }

  return config;
}
