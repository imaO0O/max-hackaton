-- Журнал событий для метрик пилота. Хранит только название события, ID пользователя в MAX
-- и обезличенные свойства (регион, путь, источник открытия). При удалении пользователя
-- события остаются для агрегированной статистики, но user_id в них обнуляется.

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  user_id INTEGER,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX events_name_created ON events(name, created_at);
CREATE INDEX events_user ON events(user_id);
