#!/usr/bin/env node
/**
 * Печать презентации для сдачи: подставляет на первый слайд хэш текущего коммита (и тег, если он есть)
 * и печатает docs/presentation/index.html в PDF через Edge или Chrome без окна.
 *
 *   npm run presentation:pdf                   — версия без токена: submission/presentation-<коммит>.pdf
 *   npm run presentation:pdf -- --with-token   — версия для личного кабинета: BOT_TOKEN из окружения или .env,
 *                                                файл submission/presentation-<коммит>-cabinet.pdf
 *
 * Папка submission/ в git не попадает, поэтому PDF с токеном в репозиторий не уйдёт.
 * Браузер ищется в стандартных местах; другой путь — переменная PDF_BROWSER.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withToken = process.argv.includes('--with-token');

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const commit = git('rev-parse', 'HEAD');
const short = git('rev-parse', '--short', 'HEAD');
let tag = '';
try {
  tag = git('describe', '--tags', '--exact-match', 'HEAD');
} catch {
  // у коммита нет тега
}
if (git('status', '--porcelain')) {
  console.warn('Внимание: есть незакоммиченные изменения — хэш на слайде не будет соответствовать содержимому.');
}

function readToken() {
  if (process.env.BOT_TOKEN) return process.env.BOT_TOKEN;
  const envFile = path.join(repoRoot, '.env');
  if (!fs.existsSync(envFile)) return null;
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((row) => /^\s*BOT_TOKEN\s*=/.test(row));
  const value = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  return value || null;
}

function findBrowser() {
  const candidates = [
    process.env.PDF_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function replaceOnce(html, from, to) {
  const parts = html.split(from);
  if (parts.length !== 2) throw new Error(`На первом слайде не найдено место для подстановки: ${from}`);
  return parts[0] + to + parts[1];
}

const token = withToken ? readToken() : null;
if (withToken && !token) {
  console.error('BOT_TOKEN не найден ни в окружении, ни в .env — версию для личного кабинета напечатать нельзя.');
  process.exit(1);
}
const browser = findBrowser();
if (!browser) {
  console.error('Не найден Edge или Chrome. Укажите путь к браузеру в PDF_BROWSER.');
  process.exit(1);
}

const sourcePath = path.join(repoRoot, 'docs', 'presentation', 'index.html');
let html = fs.readFileSync(sourcePath, 'utf8');
html = replaceOnce(html, '<span class="todo">хэш коммита на момент сдачи</span>',
  `<code>${commit}</code>${tag ? ` (тег <code>${escapeHtml(tag)}</code>)` : ''}`);
html = replaceOnce(html, '<span class="todo">значение — только в версии для личного кабинета</span>',
  token ? `<code>${escapeHtml(token)}</code>` : 'выдан организаторами, значение — в версии для личного кабинета');

// Временный файл рядом с исходником — чтобы относительные пути к скриншотам работали
const tempHtml = path.join(repoRoot, 'docs', 'presentation', `.print-${process.pid}.html`);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posle9-print-'));
const outDir = path.join(repoRoot, 'submission');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `presentation-${short}${token ? '-cabinet' : ''}.pdf`);

try {
  fs.writeFileSync(tempHtml, html);
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--user-data-dir=${profileDir}`, `--print-to-pdf=${outFile}`, pathToFileURL(tempHtml).href,
  ], { stdio: 'ignore' });
} finally {
  fs.rmSync(tempHtml, { force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
}

if (!fs.existsSync(outFile)) {
  console.error('PDF не создан — попробуйте напечатать вручную по docs/presentation/README.md.');
  process.exit(1);
}
console.log(`Готово: ${path.relative(repoRoot, outFile)}`);
console.log(`Коммит на первом слайде: ${commit}${tag ? ` (${tag})` : ''}`);
if (token) console.log('В этом PDF есть токен бота — загружайте его только в личный кабинет, в репозиторий не добавляйте.');
