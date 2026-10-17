import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Резервная копия базы SQLite во внешнем хранилище: для хостинга без постоянного диска (бесплатный Render),
 * где файл базы пропадает при каждом деплое и перезапуске.
 *
 * - При старте, если локальной базы нет, скачивает последнюю копию и проверяет, что это целая база SQLite.
 * - Периодически снимает согласованную копию (VACUUM INTO с отдельного подключения только для чтения)
 *   и выгружает её, только если содержимое изменилось. Плюс копия за день — заодно раз в сутки
 *   хранилище получает запрос и бесплатный проект Supabase не засыпает.
 * - Если при старте хранилище недоступно или копия повреждена, главная копия не перезаписывается:
 *   новые данные уходят в отдельный объект recovered/<время>.sqlite.
 */

export const MAIN_OBJECT = 'main/posle9.sqlite';
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

const sha256 = (content) => crypto.createHash('sha256').update(content).digest('hex');
const dateKey = (date) => date.toISOString().slice(0, 10);

/** Целая ли база: заголовок SQLite и PRAGMA quick_check = ok. */
function isValidSqlite(file) {
  const header = Buffer.alloc(SQLITE_HEADER.length);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!header.equals(SQLITE_HEADER)) return false;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return db.prepare('PRAGMA quick_check').get()?.quick_check === 'ok';
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

export function createDbBackup({
  databasePath,
  storage,
  logger,
  clock = () => new Date(),
  sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
  restoreAttempts = 3,
  retryDelayMs = 5000,
}) {
  const snapshotPath = `${databasePath}.snapshot`;
  let mode = 'normal';
  let recoveryObject = null;
  let lastHash = null;
  let lastDaily = null;
  let syncing = null;

  const hasLocalDatabase = () => fs.existsSync(databasePath) && fs.statSync(databasePath).size > 0;

  function enterRecovery(reason) {
    mode = 'recovery';
    recoveryObject = `recovered/${clock().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    logger.error({ reason, object: recoveryObject }, 'главная копия базы недоступна — новые данные сохраняются в отдельный объект');
  }

  /** Согласованный снимок базы, не мешая серверу писать (WAL: чтение не блокирует запись). */
  function takeSnapshot() {
    fs.rmSync(snapshotPath, { force: true });
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);
    } finally {
      db.close();
    }
    try {
      return fs.readFileSync(snapshotPath);
    } finally {
      fs.rmSync(snapshotPath, { force: true });
    }
  }

  return {
    get mode() {
      return mode;
    },

    /** @returns {Promise<'skipped'|'restored'|'empty'|'invalid'|'failed'>} */
    async restore() {
      if (hasLocalDatabase()) {
        logger.info({ databasePath }, 'локальная база уже есть — восстановление не нужно');
        return 'skipped';
      }
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      for (let attempt = 1; attempt <= restoreAttempts; attempt += 1) {
        try {
          await storage.ensureBucket();
          const content = await storage.download(MAIN_OBJECT);
          if (!content) {
            logger.info('копии базы в хранилище ещё нет — начинаем с новой базы');
            return 'empty';
          }
          const temporary = `${databasePath}.restore`;
          fs.writeFileSync(temporary, content);
          if (!isValidSqlite(temporary)) {
            fs.rmSync(temporary, { force: true });
            enterRecovery('копия в хранилище не является целой базой SQLite');
            return 'invalid';
          }
          for (const suffix of ['-wal', '-shm']) fs.rmSync(`${databasePath}${suffix}`, { force: true });
          fs.renameSync(temporary, databasePath);
          lastHash = sha256(content);
          logger.info({ bytes: content.length }, 'база восстановлена из хранилища');
          return 'restored';
        } catch (error) {
          logger.warn({ err: error.message, attempt }, 'не удалось восстановить базу из хранилища');
          if (attempt < restoreAttempts) await sleep(retryDelayMs);
        }
      }
      enterRecovery('хранилище недоступно при запуске');
      return 'failed';
    },

    /** @returns {Promise<'no-database'|'unchanged'|'uploaded'|'failed'>} */
    sync() {
      if (syncing) return syncing;
      syncing = (async () => {
        if (!hasLocalDatabase()) return 'no-database';
        let snapshot;
        try {
          snapshot = takeSnapshot();
        } catch (error) {
          logger.warn({ err: error.message }, 'не удалось снять копию базы');
          return 'failed';
        }
        const hash = sha256(snapshot);
        const today = dateKey(clock());
        const targets = [];
        if (mode === 'recovery') {
          if (hash !== lastHash) targets.push(recoveryObject);
        } else {
          if (hash !== lastHash) targets.push(MAIN_OBJECT);
          if (hash !== lastHash || today !== lastDaily) targets.push(`daily/${today}.sqlite`);
        }
        if (targets.length === 0) return 'unchanged';
        try {
          for (const target of targets) await storage.upload(target, snapshot);
        } catch (error) {
          logger.warn({ err: error.message }, 'не удалось выгрузить копию базы — повторим в следующий раз');
          return 'failed';
        }
        lastHash = hash;
        if (mode !== 'recovery') lastDaily = today;
        return 'uploaded';
      })().finally(() => {
        syncing = null;
      });
      return syncing;
    },
  };
}
