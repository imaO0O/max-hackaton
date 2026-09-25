#!/bin/sh
# Обновление сервера с автоматическим откатом и откат вручную.
#
#   ./scripts/deploy.sh                 обновить до последнего main
#   ./scripts/deploy.sh v0.2.0          развернуть версию по тегу, ветке или коммиту
#   ./scripts/deploy.sh --rollback      вернуть предыдущую развёрнутую версию
#   ./scripts/deploy.sh --rollback v0.1.0   вернуть конкретную версию
#   ./scripts/deploy.sh --status        что развёрнуто сейчас и история
#
# Как это работает:
# 1. Перед обновлением делается копия базы (scripts/backup-db.sh).
# 2. Каждый собранный образ сохраняется под тегом posle9:<коммит> — к нему можно вернуться без пересборки.
# 3. После запуска скрипт ждёт /api/health. Если сервис не поднялся за 90 секунд,
#    автоматически возвращается образ, который работал до обновления.
# История развёртываний — в .deploy/history (коммит, время, результат).

set -eu

# Обновление рабочей папки (git merge) может заменить этот файл, пока он выполняется.
# Поэтому скрипт копирует себя во временный файл и продолжает работу из копии.
REPO_DIR=${POSLE9_REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
if [ -z "${POSLE9_DEPLOY_COPY:-}" ]; then
  copy=$(mktemp)
  cp "$0" "$copy"
  POSLE9_DEPLOY_COPY="$copy" POSLE9_REPO_DIR="$REPO_DIR" exec sh "$copy" "$@"
fi
trap 'rm -f "$POSLE9_DEPLOY_COPY"' EXIT
cd "$REPO_DIR"

IMAGE=posle9
DEPLOY_DIR=.deploy
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-90}

env_value() {
  [ -f .env ] || return 0
  grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

APP_PORT=$(env_value APP_PORT)
APP_PORT=${APP_PORT:-8080}
HEALTH_URL=${HEALTH_URL:-http://localhost:$APP_PORT/api/health}
BOT_ENABLED=$(env_value BOT_ENABLED)

# С доменом в .env поднимаем и HTTPS-прокси
if [ -n "$(env_value DOMAIN)" ]; then
  COMPOSE="docker compose --profile https"
else
  COMPOSE="docker compose"
fi

mkdir -p "$DEPLOY_DIR"
touch "$DEPLOY_DIR/history"

log() { echo "[deploy] $*"; }
now() { date '+%Y-%m-%d %H:%M:%S'; }

image_exists() { docker image inspect "$1" > /dev/null 2>&1; }

current_version() { cat "$DEPLOY_DIR/current" 2>/dev/null || true; }

# Ждём, пока /api/health ответит status=ok и бот запущен (или выключен в .env)
wait_healthy() {
  waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    body=$(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null || true)
    case "$body" in
      *'"status":"ok"'*'"bot":"running"'*) return 0 ;;
      *'"status":"ok"'*'"bot":"disabled"'*)
        [ "$BOT_ENABLED" = "false" ] && return 0 ;;
    esac
    sleep 3
    waited=$((waited + 3))
  done
  log "сервис не ответил за ${HEALTH_TIMEOUT_SECONDS} с. Последний ответ: ${body:-нет ответа}"
  return 1
}

# Переключить работающий контейнер на уже собранный образ posle9:<версия>
switch_to() {
  docker tag "$IMAGE:$1" "$IMAGE:local"
  $COMPOSE up -d --no-build
}

record() {
  echo "$(now) $1 $2" >> "$DEPLOY_DIR/history"
}

# Храним образы последних KEEP_IMAGES версий (плюс текущий и сохранённые before-*), остальные удаляем
KEEP_IMAGES=${KEEP_IMAGES:-6}
prune_images() {
  current=$(current_version)
  # docker image ls выводит образы от новых к старым
  docker image ls "$IMAGE" --format '{{.Tag}}' \
    | grep -v -x -e local -e "$current" -e '<none>' \
    | grep -v '^before-' \
    | tail -n +"$((KEEP_IMAGES + 1))" \
    | while read -r tag; do
        docker image rm "$IMAGE:$tag" > /dev/null 2>&1 && log "удалён старый образ $IMAGE:$tag"
      done || true
}

# Рабочая папка всегда на main: в ней актуальные compose.yaml и скрипты.
# Если там локальные правки, обновление пропускается — образ всё равно собирается из нужной версии.
update_checkout() {
  git fetch --quiet --tags origin
  if git checkout --quiet main 2>/dev/null && git merge --quiet --ff-only origin/main 2>/dev/null; then
    return 0
  fi
  log "не удалось обновить рабочую папку до origin/main (локальные правки?) — продолжаю"
}

# Собрать образ posle9:<коммит> из отдельной копии нужной версии (git worktree)
build_image() {
  version=$1
  src="$DEPLOY_DIR/src-$version"
  git worktree remove --force "$src" > /dev/null 2>&1 || true
  git worktree add --quiet --detach "$src" "$version"
  # Версия видна в /api/health: тег, если он есть у коммита, и сам коммит
  label=$version
  tag=$(git describe --tags --exact-match "$version" 2> /dev/null || true)
  if [ -n "$tag" ]; then label="$tag ($version)"; fi
  if docker build --build-arg "APP_VERSION=$label" -t "$IMAGE:$version" "$src"; then
    git worktree remove --force "$src"
  else
    git worktree remove --force "$src" || true
    log "сборка версии $version не удалась — работающая версия не тронута"
    exit 1
  fi
}

deploy() {
  ref=${1:-origin/main}
  log "получаю изменения из репозитория"
  update_checkout
  target=$(git rev-parse --short "$ref^{commit}")
  previous=$(current_version)

  # Первый запуск скрипта: сохраняем то, что работает сейчас, чтобы было куда откатиться
  if [ -z "$previous" ] && image_exists "$IMAGE:local"; then
    previous="before-$(date +%Y%m%d-%H%M)"
    docker tag "$IMAGE:local" "$IMAGE:$previous"
    log "текущий образ сохранён как $IMAGE:$previous"
  fi

  if docker compose ps --status running --services 2>/dev/null | grep -qx app; then
    log "копия базы перед обновлением"
    ./scripts/backup-db.sh || log "копию базы сделать не удалось — продолжаю, данные в томе storage не трогаются"
  fi

  log "версия $target ($ref)"
  if image_exists "$IMAGE:$target"; then
    log "образ $IMAGE:$target уже собран — пересборка не нужна"
  else
    log "сборка образа"
    build_image "$target"
  fi
  switch_to "$target"

  if wait_healthy; then
    echo "$target" > "$DEPLOY_DIR/current"
    record "$target" "ok"
    log "готово: работает $target"
    prune_images
    return 0
  fi

  record "$target" "failed"
  docker compose logs --tail=60 app || true
  if [ -n "$previous" ] && image_exists "$IMAGE:$previous"; then
    log "откат на $previous"
    switch_to "$previous"
    if wait_healthy; then
      record "$previous" "rollback-ok"
      log "откат выполнен, работает $previous. Обновление $target не применено — смотрите логи выше"
    else
      record "$previous" "rollback-failed"
      log "после отката сервис тоже не отвечает — нужна ручная проверка: docker compose logs app"
    fi
  else
    log "предыдущей версии нет — откатиться некуда, смотрите логи выше"
  fi
  return 1
}

rollback() {
  target=${1:-}
  current=$(current_version)
  if [ -z "$target" ]; then
    # Предыдущая успешная версия, отличная от текущей
    target=$(grep -E ' (ok|rollback-ok)$' "$DEPLOY_DIR/history" | awk '{print $3}' | grep -vx "$current" | tail -n 1 || true)
    if [ -z "$target" ]; then
      log "в истории нет предыдущей рабочей версии. Укажите версию явно: ./scripts/deploy.sh --rollback v0.1.0"
      exit 1
    fi
  else
    case "$target" in
      before-*) ;;
      *) update_checkout; target=$(git rev-parse --short "$target^{commit}") ;;
    esac
  fi

  if ! image_exists "$IMAGE:$target"; then
    log "образа $IMAGE:$target нет на сервере — собираю эту версию заново"
    deploy "$target"
    return $?
  fi

  log "откат: $current → $target (без пересборки)"
  switch_to "$target"
  if wait_healthy; then
    echo "$target" > "$DEPLOY_DIR/current"
    record "$target" "rollback-ok"
    log "готово: работает $target"
  else
    record "$target" "rollback-failed"
    docker compose logs --tail=60 app || true
    log "версия $target не поднялась — смотрите логи выше"
    exit 1
  fi
}

status() {
  echo "Работает сейчас: $(current_version || true)"
  echo "Сохранённые образы:"
  docker image ls "$IMAGE" --format '  {{.Tag}}  {{.CreatedSince}}' | grep -v '  local ' || true
  echo "История (последние 10):"
  tail -n 10 "$DEPLOY_DIR/history" | sed 's/^/  /'
  echo "Проверка: $(curl -fsS -m 5 "$HEALTH_URL" 2>/dev/null || echo 'нет ответа')"
}

case "${1:-}" in
  --rollback) rollback "${2:-}" ;;
  --status) status ;;
  -h|--help) sed -n '2,16p' "$0" ;;
  *) deploy "${1:-}" ;;
esac
