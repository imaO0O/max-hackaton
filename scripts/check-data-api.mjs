#!/usr/bin/env node
/**
 * Прогоняет обязательные проверки из DATA-API.yaml так же, как платформа оценки:
 * метод и путь, параметры, извлечение значений из предыдущих ответов (extract), статус-коды,
 * тип содержимого и обязательные поля.
 *
 *   npm run api:check                         — сервер из DATA-API.yaml (боевой)
 *   npm run api:check -- http://localhost:8080 — локальный запуск
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = YAML.parse(fs.readFileSync(path.join(repoRoot, 'DATA-API.yaml'), 'utf8'));
const baseUrl = (process.argv[2] ?? spec.api.baseUrl).replace(/\/+$/, '');

/** «error.code» → body.error.code */
const field = (body, dotted) => dotted.split('.').reduce((value, key) => (value == null ? undefined : value[key]), body);
/** «$.colleges[0].id» → body.colleges[0].id */
const jsonPath = (body, expression) => expression.replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter(Boolean)
  .reduce((value, key) => (value == null ? undefined : value[key]), body);

const variables = {};
const substitute = (value) => (typeof value === 'string'
  ? value.replace(/\$\{(\w+)\}/g, (_, name) => variables[name] ?? '')
  : value);

let failed = 0;
for (const check of spec.checks) {
  let checkPath = check.path;
  for (const [name, value] of Object.entries(check.request?.path ?? {})) {
    checkPath = checkPath.replace(`{${name}}`, encodeURIComponent(substitute(value)));
  }
  const url = new URL(baseUrl + checkPath);
  for (const [name, value] of Object.entries(check.request?.query ?? {})) {
    url.searchParams.set(name, Array.isArray(value) ? value.join(',') : substitute(value));
  }

  const started = Date.now();
  let status;
  let contentType = '';
  let body = null;
  try {
    const response = await fetch(url, {
      method: check.method,
      headers: { ...spec.api.defaultHeaders, ...check.request?.headers },
      body: check.request?.body ? JSON.stringify(check.request.body) : undefined,
      signal: AbortSignal.timeout(check.timeoutMs ?? 5000),
    });
    status = response.status;
    contentType = response.headers.get('content-type') ?? '';
    body = await response.json().catch(() => null);
  } catch (error) {
    status = `нет ответа (${error.message})`;
  }
  for (const [name, expression] of Object.entries(check.extract ?? {})) variables[name] = jsonPath(body, expression);

  const problems = [];
  if (!check.expected.statusCodes.includes(status)) problems.push(`статус ${status}, ожидался ${check.expected.statusCodes.join(' или ')}`);
  if (check.expected.contentType && !contentType.startsWith(check.expected.contentType)) problems.push(`тип ${contentType || 'не указан'}`);
  for (const name of check.expected.requiredFields ?? []) {
    if (field(body, name) === undefined) problems.push(`нет поля ${name}`);
  }
  if (problems.length) failed += 1;
  const target = `${check.method} ${decodeURIComponent(url.pathname)}${url.search}`;
  console.log(`${problems.length ? '✖' : '✔'} ${check.id}: ${target} — ${Date.now() - started} мс${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}

console.log(failed ? `\nНе прошли ${failed} из ${spec.checks.length} проверок (${baseUrl})` : `\nВсе ${spec.checks.length} проверок прошли (${baseUrl})`);
process.exitCode = failed ? 1 : 0;
