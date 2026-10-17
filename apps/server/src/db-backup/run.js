/**
 * Точка входа в Docker: сервер и резервная копия базы в Supabase Storage.
 *
 * Без SUPABASE_URL и SUPABASE_SECRET_KEY просто запускает сервер, как раньше.
 * С ними: восстанавливает базу из хранилища (если локальной нет), запускает сервер отдельным процессом,
 * каждые DB_BACKUP_INTERVAL_SECONDS выгружает изменившуюся копию, а при остановке — последнюю.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig } from '../config.js';
import { createDbBackup } from './db-backup.js';
import { backupSettings } from './settings.js';
import { createSupabaseStorage } from './supabase-storage.js';

const serverEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const FINAL_SYNC_TIMEOUT_MS = 20_000;

/** Строки лога в том же формате JSON, что и у сервера (pino), чтобы их было видно в одном потоке. */
function createLogger() {
  const write = (level, label) => (details, msg) => {
    process.stdout.write(`${JSON.stringify({ level, label, time: Date.now(), module: 'db-backup', msg, ...details })}\n`);
  };
  return { info: write(30, 'info'), warn: write(40, 'warn'), error: write(50, 'error') };
}

async function main() {
  const settings = backupSettings(process.env);
  if (!settings) {
    await import(pathToFileURL(serverEntry).href);
    return;
  }

  const logger = createLogger();
  const { databasePath } = loadConfig(process.env);
  const backup = createDbBackup({
    databasePath,
    storage: createSupabaseStorage({ url: settings.url, key: settings.key, bucket: settings.bucket }),
    logger,
  });

  const restored = await backup.restore();
  logger.info({ result: restored, bucket: settings.bucket, intervalSeconds: settings.intervalMs / 1000 }, 'копия базы в Supabase включена');

  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', serverEntry], {
    stdio: 'inherit',
    env: process.env,
  });
  const timer = setInterval(() => { backup.sync(); }, settings.intervalMs);

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => { server.kill(signal); });
  }

  server.on('exit', async (code, signal) => {
    clearInterval(timer);
    const result = await Promise.race([
      backup.sync(),
      new Promise((resolve) => { setTimeout(() => resolve('timeout'), FINAL_SYNC_TIMEOUT_MS); }),
    ]);
    logger.info({ result, code, signal }, 'последняя копия базы перед остановкой');
    process.exit(code ?? (signal ? 0 : 1));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
