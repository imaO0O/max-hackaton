#!/bin/sh
# Резервная копия базы из работающего контейнера app.
# Копия делается средствами SQLite и согласована даже во время записи.
#
# Запуск вручную:   ./scripts/backup-db.sh
# Каждый день в 03:00 (crontab -e):
#   0 3 * * * cd /root/max-hackaton && ./scripts/backup-db.sh >> backups/backup.log 2>&1
#
# Хранятся 14 последних копий в папке backups/.

set -eu
cd "$(dirname "$0")/.."

mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)
tmp=/app/storage/backup-in-progress.sqlite

docker compose exec -T app node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync, backup } = require('node:sqlite');
const db = new DatabaseSync(process.env.DATABASE_PATH);
backup(db, '$tmp')
  .then((pages) => { console.log('pages copied:', pages); db.close(); })
  .catch((error) => { console.error(error); process.exit(1); });
"
docker compose cp "app:$tmp" "backups/posle9-$stamp.sqlite"
docker compose exec -T app rm -f "$tmp"

ls -1t backups/posle9-*.sqlite | tail -n +15 | xargs -r rm -f
echo "backup saved: backups/posle9-$stamp.sqlite"
