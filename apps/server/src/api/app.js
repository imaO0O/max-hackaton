import fs from 'node:fs';
import path from 'node:path';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { AppError } from '../services/errors.js';
import { validateInitData } from './init-data.js';
import { createRateLimiter } from './rate-limit.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerPlanRoutes } from './routes/plan.js';

/**
 * HTTP-сервер: REST API мини-приложения под /api и статика собранного мини-приложения.
 * Маршруты с config.auth = true требуют заголовок X-Max-Init-Data с подписанными данными запуска.
 */
export function buildApp({ config, services, runtime, logger = true }) {
  const app = Fastify({
    logger: logger === true ? { level: config.logLevel } : logger,
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  app.decorateRequest('maxUser', null);
  app.decorateRequest('startParam', null);

  // Ограничение частоты запросов к API по IP (за прокси Caddy — по X-Forwarded-For). 0 — выключено
  if (config.rateLimitPerMinute > 0) {
    const limiter = createRateLimiter({ max: config.rateLimitPerMinute });
    app.addHook('onRequest', async (request, reply) => {
      if (!request.url.startsWith('/api/') || request.url === '/api/health') return;
      const { allowed, retryAfterSeconds } = limiter.hit(request.ip);
      if (!allowed) {
        reply.header('Retry-After', String(retryAfterSeconds));
        throw new AppError(429, 'rate_limited', 'Слишком много запросов. Подождите минуту и попробуйте снова');
      }
    });
  }

  app.addHook('onRequest', async (request) => {
    if (!request.routeOptions.config?.auth) return;

    if (config.authDevBypass && request.headers['x-dev-user-id']) {
      const id = Number(request.headers['x-dev-user-id']);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new AppError(401, 'unauthorized', 'Некорректный X-Dev-User-Id');
      }
      request.maxUser = { id };
      request.startParam = request.headers['x-dev-start-param'] ?? null;
      return;
    }

    const result = validateInitData(request.headers['x-max-init-data'], config.botToken, {
      maxAgeSeconds: config.initDataMaxAgeSeconds,
    });
    if (!result.ok) {
      request.log.warn({ reason: result.reason }, 'init data rejected');
      const message = result.reason === 'expired'
        ? 'Сессия устарела. Закройте и снова откройте мини-приложение'
        : 'Откройте мини-приложение из чата с ботом в MAX';
      throw new AppError(401, 'unauthorized', message);
    }
    request.maxUser = { id: result.user.id };
    request.startParam = result.startParam;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'validation_error', message: 'Некорректные параметры запроса', details: error.message },
      });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: { code: 'bad_request', message: error.message } });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Что-то пошло не так. Попробуйте ещё раз' } });
  });

  // HTTP-сервер отвечает 200, пока жив (так ждёт автопроверка из DATA-API.yaml).
  // Если бот потерял связь с MAX, это видно в теле ответа: status = degraded
  app.get('/api/health', async () => {
    const botDown = runtime.botStatus === 'failed' || runtime.botStatus === 'unreachable';
    return {
      status: botDown ? 'degraded' : 'ok',
      bot: runtime.botStatus,
      academicYear: services.plan.currentAcademicYear(),
      version: config.appVersion,
    };
  });

  app.get('/api/meta', async () => ({
    academicYear: services.plan.currentAcademicYear(),
    botUsername: runtime.botUsername,
  }));

  app.register(async (api) => {
    registerCatalogRoutes(api, services);
    registerPlanRoutes(api, services);
    registerCalendarRoutes(api, services);
  }, { prefix: '/api' });

  const indexHtml = path.join(config.miniappDistDir, 'index.html');
  const hasMiniapp = fs.existsSync(indexHtml);
  if (hasMiniapp) {
    app.register(fastifyStatic, { root: config.miniappDistDir, index: ['index.html'] });
  }

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0];
    const looksLikeFile = /\.[a-z0-9]+$/i.test(pathname);
    if (pathname.startsWith('/api/') || !hasMiniapp || request.method !== 'GET' || looksLikeFile) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' } });
    }
    // Любой другой путь — точка входа мини-приложения
    return reply.type('text/html').sendFile('index.html');
  });

  return app;
}
