#!/usr/bin/env node
/**
 * Проверяет ссылки на первоисточники из data/*.json: открывается ли страница.
 * Запускает ответственный за данные — по календарю сверок (docs/data-verification.md) и перед показом.
 * Сайт, который не открывается, — повод сверить запись в тот же срок, что и сообщение о неточности.
 *
 *   npm run data:links
 *
 * Раз в неделю запускается в GitHub Actions (.github/workflows/source-links.yml), отдельно от проверок PR:
 * сайты колледжей и ведомств бывают недоступны по причинам, не связанным с кодом.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { trustRussianRootCa } from '../apps/server/src/tls-ca.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'data');
const TIMEOUT_MS = 15000;
const PARALLEL = 4;
// Некоторые сайты отвечают ошибкой на запросы без браузерных заголовков
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
  'accept-language': 'ru-RU,ru;q=0.9',
};

/** Все ссылки из файла: адрес → где встречается (файл и id ближайшей записи). */
function collectLinks(file, links) {
  const visit = (value, owner) => {
    if (Array.isArray(value)) value.forEach((item) => visit(item, owner));
    else if (value && typeof value === 'object') {
      const id = value.id ?? owner;
      Object.values(value).forEach((item) => visit(item, id));
    } else if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      if (!links.has(value)) links.set(value, []);
      links.get(value).push(`${file}${owner ? `: ${owner}` : ''}`);
    }
  };
  visit(JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')), null);
}

/** ok — страница открылась; broken — точно не работает; manual — проверьте в браузере (защита от ботов, сертификат, таймаут). */
async function check(url) {
  const request = (method) => fetch(url, {
    method, headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  try {
    let response = await request('HEAD');
    // HEAD часто не поддерживают — повторяем обычным запросом
    if (response.status >= 400) response = await request('GET');
    await response.body?.cancel();
    if (response.ok) return { result: 'ok', detail: String(response.status) };
    if ([404, 410].includes(response.status)) return { result: 'broken', detail: `${response.status}: страницы нет` };
    return { result: 'manual', detail: `ответ ${response.status}` };
  } catch (error) {
    const code = error.cause?.code ?? error.name;
    if (code === 'ENOTFOUND') return { result: 'broken', detail: 'домен не найден' };
    if (code === 'TimeoutError') return { result: 'manual', detail: `нет ответа за ${TIMEOUT_MS / 1000} с` };
    // Сайты ведомств часто используют сертификат НУЦ Минцифры, которого нет в Node.js
    if (/CERT|SSL|TLS|SELF_SIGNED/i.test(code)) return { result: 'manual', detail: `сертификат: ${code}` };
    return { result: 'manual', detail: code };
  }
}

// Сайты ведомств часто используют сертификат НУЦ Минцифры — доверяем ему так же, как сервер
trustRussianRootCa();

const links = new Map();
fs.readdirSync(dataDir).filter((file) => file.endsWith('.json')).sort().forEach((file) => collectLinks(file, links));

const urls = [...links.keys()];
const results = new Map();
let next = 0;
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (next < urls.length) {
    const url = urls[next];
    next += 1;
    results.set(url, await check(url));
  }
}));

const groups = { ok: [], manual: [], broken: [] };
for (const url of urls) groups[results.get(url).result].push(url);
const print = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title}: ${list.length}`);
  for (const url of list) {
    console.log(`  ${url} — ${results.get(url).detail}`);
    console.log(`    ${links.get(url).join('; ')}`);
  }
};

console.log(`Ссылок на источники: ${urls.length}. Открываются: ${groups.ok.length}.`);
print('Не работают — сверьте записи и замените ссылку', groups.broken);
print('Откройте в браузере — автоматическая проверка не прошла', groups.manual);
// В GitHub Actions — сводка на странице запуска
if (process.env.GITHUB_STEP_SUMMARY) {
  const table = (title, list) => (list.length
    ? [`\n### ${title}: ${list.length}\n`, '| Ссылка | Результат | Где |', '|---|---|---|',
      ...list.map((url) => `| ${url} | ${results.get(url).detail} | ${links.get(url).join('; ')} |`)].join('\n')
    : '');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '## Ссылки на источники',
    '',
    `Всего: ${urls.length}, открываются: ${groups.ok.length}.`,
    table('Не работают — сверить записи за 3 рабочих дня', groups.broken),
    table('Открыть в браузере', groups.manual),
    '',
  ].join('\n'));
}
if (groups.broken.length) process.exitCode = 1;
