import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createDbBackup, MAIN_OBJECT } from '../src/db-backup/db-backup.js';
import { backupSettings } from '../src/db-backup/settings.js';
import { createSupabaseStorage } from '../src/db-backup/supabase-storage.js';

const silent = { info() {}, warn() {}, error() {} };
const noSleep = async () => {};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'posle9-backup-'));
}

/** Хранилище в памяти; failing — сколько первых запросов упадёт с ошибкой сети. */
function memoryStorage({ failing = 0 } = {}) {
  const objects = new Map();
  let calls = 0;
  const maybeFail = () => {
    calls += 1;
    if (calls <= failing) throw new Error('сеть недоступна');
  };
  return {
    objects,
    async ensureBucket() { maybeFail(); },
    async download(name) { maybeFail(); return objects.get(name) ?? null; },
    async upload(name, content) { maybeFail(); objects.set(name, Buffer.from(content)); },
  };
}

/** База приложения в режиме WAL с таблицей и строками. */
function createAppDatabase(file, rows) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS t (x INTEGER);');
  for (const row of rows) db.prepare('INSERT INTO t VALUES (?)').run(row);
  return db;
}

const countRows = (content, dir) => {
  const file = path.join(dir, `check-${Math.random()}.sqlite`);
  fs.writeFileSync(file, content);
  const db = new DatabaseSync(file, { readOnly: true });
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM t').get();
  db.close();
  return count;
};

test('выгрузка: главная копия и копия за день, без изменений — ничего не грузим, новый день — копия за день', async () => {
  const dir = tempDir();
  const databasePath = path.join(dir, 'posle9.sqlite');
  const db = createAppDatabase(databasePath, [1, 2]);
  const storage = memoryStorage();
  const clock = { now: new Date('2026-10-20T10:00:00Z') };
  const backup = createDbBackup({ databasePath, storage, logger: silent, clock: () => clock.now });

  assert.equal(await backup.sync(), 'uploaded');
  assert.deepEqual([...storage.objects.keys()].sort(), ['daily/2026-10-20.sqlite', MAIN_OBJECT]);
  assert.equal(countRows(storage.objects.get(MAIN_OBJECT), dir), 2);

  assert.equal(await backup.sync(), 'unchanged', 'база не менялась — повторной загрузки нет');

  db.prepare('INSERT INTO t VALUES (3)').run();
  assert.equal(await backup.sync(), 'uploaded');
  assert.equal(countRows(storage.objects.get(MAIN_OBJECT), dir), 3, 'запись, ещё не перенесённая из WAL, попала в копию');

  clock.now = new Date('2026-10-21T10:00:00Z');
  assert.equal(await backup.sync(), 'uploaded', 'новый день — копия за день, хранилище получает запрос');
  assert.ok(storage.objects.has('daily/2026-10-21.sqlite'));

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('восстановление: копия из хранилища становится базой, локальная база не перезаписывается', async () => {
  const source = tempDir();
  const sourceDb = createAppDatabase(path.join(source, 'posle9.sqlite'), [1, 2, 3]);
  const storage = memoryStorage();
  await createDbBackup({ databasePath: path.join(source, 'posle9.sqlite'), storage, logger: silent }).sync();
  sourceDb.close();

  const fresh = tempDir();
  const freshPath = path.join(fresh, 'storage', 'posle9.sqlite');
  const backup = createDbBackup({ databasePath: freshPath, storage, logger: silent });
  assert.equal(await backup.restore(), 'restored');
  assert.equal(countRows(fs.readFileSync(freshPath), fresh), 3);
  assert.equal(await backup.sync(), 'uploaded', 'после восстановления — только копия за день');
  assert.equal(backup.mode, 'normal');

  assert.equal(await createDbBackup({ databasePath: freshPath, storage, logger: silent }).restore(), 'skipped');

  fs.rmSync(source, { recursive: true, force: true });
  fs.rmSync(fresh, { recursive: true, force: true });
});

test('первый запуск: копии нет — новая база, дальше обычные выгрузки', async () => {
  const dir = tempDir();
  const databasePath = path.join(dir, 'posle9.sqlite');
  const storage = memoryStorage();
  const backup = createDbBackup({ databasePath, storage, logger: silent });
  assert.equal(await backup.restore(), 'empty');
  assert.equal(await backup.sync(), 'no-database', 'сервер ещё не создал базу');
  const db = createAppDatabase(databasePath, [1]);
  assert.equal(await backup.sync(), 'uploaded');
  assert.ok(storage.objects.has(MAIN_OBJECT));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('хранилище недоступно при старте: повторы, затем главная копия не перезаписывается', async () => {
  const dir = tempDir();
  const databasePath = path.join(dir, 'posle9.sqlite');
  const storage = memoryStorage({ failing: 3 });
  storage.objects.set(MAIN_OBJECT, Buffer.from('главная копия'));
  const backup = createDbBackup({
    databasePath, storage, logger: silent, sleep: noSleep, clock: () => new Date('2026-10-20T10:00:00Z'),
  });

  assert.equal(await backup.restore(), 'failed');
  assert.equal(backup.mode, 'recovery');

  const db = createAppDatabase(databasePath, [1]);
  assert.equal(await backup.sync(), 'uploaded');
  assert.equal(storage.objects.get(MAIN_OBJECT).toString(), 'главная копия', 'главная копия цела');
  assert.ok([...storage.objects.keys()].some((name) => name.startsWith('recovered/2026-10-20T10-00-00')));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('повреждённая копия не становится базой', async () => {
  const dir = tempDir();
  const databasePath = path.join(dir, 'posle9.sqlite');
  const storage = memoryStorage();
  storage.objects.set(MAIN_OBJECT, Buffer.from('это не база'));
  const backup = createDbBackup({ databasePath, storage, logger: silent });
  assert.equal(await backup.restore(), 'invalid');
  assert.equal(fs.existsSync(databasePath), false);
  assert.equal(backup.mode, 'recovery');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ошибка выгрузки не ломает работу: повтор в следующий раз', async () => {
  const dir = tempDir();
  const databasePath = path.join(dir, 'posle9.sqlite');
  const db = createAppDatabase(databasePath, [1]);
  const storage = memoryStorage({ failing: 1 });
  const backup = createDbBackup({ databasePath, storage, logger: silent });
  assert.equal(await backup.sync(), 'failed');
  assert.equal(await backup.sync(), 'uploaded');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Supabase Storage: ключ sb_secret — только в apikey, загрузка с x-upsert, нет объекта — null, бакет создаётся', async () => {
  const requests = [];
  const responses = [
    new Response('{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}', { status: 400 }),
    new Response('{"name":"posle9-db"}', { status: 200 }),
    new Response('{"statusCode":"404","error":"not_found","message":"Object not found"}', { status: 400 }),
    new Response('{"Key":"posle9-db/main/posle9.sqlite"}', { status: 200 }),
    new Response('ошибка сервера', { status: 500 }),
  ];
  const fetch = async (url, init) => {
    requests.push({ url, method: init.method, headers: init.headers });
    return responses.shift();
  };
  const storage = createSupabaseStorage({ url: 'https://abc.supabase.co/', key: 'sb_secret_test', bucket: 'posle9-db', fetch });

  assert.equal(await storage.ensureBucket(), 'created');
  assert.equal(await storage.download('main/posle9.sqlite'), null);
  await storage.upload('main/posle9.sqlite', Buffer.from('x'));
  await assert.rejects(storage.download('main/posle9.sqlite'), /HTTP 500/);

  assert.equal(requests[0].url, 'https://abc.supabase.co/storage/v1/bucket/posle9-db');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[3].url, 'https://abc.supabase.co/storage/v1/object/posle9-db/main/posle9.sqlite');
  assert.equal(requests[3].headers['x-upsert'], 'true');
  assert.equal(requests[3].headers.apikey, 'sb_secret_test');
  assert.equal(requests[3].headers.Authorization, undefined, 'новый ключ не JWT — не в Authorization');

  const legacy = createSupabaseStorage({ url: 'https://abc.supabase.co', key: 'eyJhbGciOi.test', bucket: 'b-1', fetch: async (url, init) => {
    requests.push({ headers: init.headers });
    return new Response('{}', { status: 200 });
  } });
  await legacy.ensureBucket();
  assert.equal(requests.at(-1).headers.Authorization, 'Bearer eyJhbGciOi.test');
});

test('настройки копии: выключена без переменных, ошибка при неполных или неверных', () => {
  assert.equal(backupSettings({}), null);
  assert.deepEqual(backupSettings({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }), {
    url: 'https://abc.supabase.co', key: 'sb_secret_x', bucket: 'posle9-db', intervalMs: 30_000,
  });
  assert.throws(() => backupSettings({ SUPABASE_URL: 'https://abc.supabase.co' }), /обе переменные/);
  assert.throws(() => backupSettings({ SUPABASE_URL: 'abc.supabase.co', SUPABASE_SECRET_KEY: 'k' }), /SUPABASE_URL/);
  assert.throws(() => backupSettings({ SUPABASE_URL: 'http://abc.supabase.co', SUPABASE_SECRET_KEY: 'k' }), /SUPABASE_URL/, 'http — только локально');
  assert.equal(backupSettings({ SUPABASE_URL: 'http://127.0.0.1:9000', SUPABASE_SECRET_KEY: 'k' }).url, 'http://127.0.0.1:9000');
  assert.throws(() => backupSettings({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SECRET_KEY: 'k', DB_BACKUP_INTERVAL_SECONDS: '5' }), /не меньше 10/);
});
