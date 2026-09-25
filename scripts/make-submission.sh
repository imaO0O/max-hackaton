#!/bin/sh
# Подготовка к сдаче: проверки, архив исходников зафиксированного коммита и контрольная сумма.
# Запускать из main после последнего слияния: ./scripts/make-submission.sh
# Архив и файл с суммой появятся в папке submission/ (в git не попадает).

set -eu
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Есть незакоммиченные изменения — сначала закоммитьте или уберите их." >&2
  git status --short >&2
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "Внимание: текущая ветка $branch, а сдаётся обычно main." >&2
fi

echo "== Проверки"
npm test
npm run data:check

commit=$(git rev-parse HEAD)
short=$(git rev-parse --short HEAD)
mkdir -p submission
archive="submission/posle9-$short.zip"
git archive --format=zip --prefix=posle9/ -o "$archive" HEAD

if command -v sha256sum > /dev/null 2>&1; then
  sum=$(sha256sum "$archive" | cut -d' ' -f1)
else
  sum=$(shasum -a 256 "$archive" | cut -d' ' -f1)
fi
echo "$sum  $(basename "$archive")" > "$archive.sha256"

remote=$(git remote get-url origin 2>/dev/null || echo "—")
echo
echo "== Для первого слайда и формы сдачи"
echo "Репозиторий:  $remote"
echo "Коммит:       $commit"
echo "Архив:        $archive"
echo "SHA-256:      $sum"
echo
echo "Проверить архив на другой машине: sha256sum -c $(basename "$archive").sha256"
