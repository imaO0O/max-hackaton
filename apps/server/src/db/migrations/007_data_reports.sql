-- Сообщения о неточностях в данных: программа колледжа или пункт плана и причина из списка, без свободного текста.
-- После удаления данных пользователя сообщение остаётся обезличенным: user_id становится NULL.
-- Только добавление таблицы: предыдущая версия кода продолжает работать с этой базой.

CREATE TABLE data_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(max_user_id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('program', 'item')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Одна и та же семья сообщает об одной неточности один раз
CREATE UNIQUE INDEX data_reports_once ON data_reports(user_id, target_type, target_id, reason);
CREATE INDEX data_reports_target ON data_reports(target_type, target_id);
