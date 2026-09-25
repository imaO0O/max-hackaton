# syntax=docker/dockerfile:1

# 1. Все зависимости рабочих пространств — для сборки мини-приложения
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/miniapp/package.json apps/miniapp/
RUN npm ci --no-audit --no-fund

# 2. Сборка мини-приложения (Vite)
FROM deps AS miniapp-build
COPY packages/core packages/core
COPY apps/miniapp apps/miniapp
RUN npm run build --workspace apps/miniapp

# 3. Только производственные зависимости для сервера
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/miniapp/package.json apps/miniapp/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 4. Итоговый образ: сервер (API + бот + напоминания) и статика мини-приложения
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_PATH=/app/storage/posle9.sqlite \
    NODE_EXTRA_CA_CERTS=/app/apps/server/certs/russian-trusted-root-ca.pem
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/core ./packages/core
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/src ./apps/server/src
COPY apps/server/certs ./apps/server/certs
COPY apps/miniapp/package.json ./apps/miniapp/package.json
COPY --from=miniapp-build /app/apps/miniapp/dist ./apps/miniapp/dist
COPY data ./data

RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health > /dev/null || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/src/index.js"]
