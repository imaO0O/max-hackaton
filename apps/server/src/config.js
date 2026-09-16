import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  };

  if (config.botEnabled && !config.botToken) {
    throw new Error('BOT_TOKEN не задан. Укажите токен или выключите бота: BOT_ENABLED=false');
  }
  if (!config.botToken && !config.authDevBypass) {
    throw new Error('Без BOT_TOKEN невозможно проверить подпись мини-приложения. Для локальной разработки включите AUTH_DEV_BYPASS=true');
  }

  return config;
}
