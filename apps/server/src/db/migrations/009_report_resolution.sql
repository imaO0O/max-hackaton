-- Обработка сообщений о неточностях: когда и с каким итогом закрыто («исправлено» или «данные верны»).
-- Срок обработки — 3 рабочих дня (docs/data-verification.md). Только добавление столбцов — откат безопасен.

ALTER TABLE data_reports ADD COLUMN resolved_at TEXT;
ALTER TABLE data_reports ADD COLUMN resolution TEXT;
