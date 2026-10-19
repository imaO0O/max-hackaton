-- Шаг на эту неделю: семья выбирает одно действие, через 5 дней бот спрашивает «Получилось?».
-- Здесь — только текущее состояние для вопроса; метрики считаются по журналу событий.
-- Только добавление таблицы: предыдущая версия кода продолжает работать с этой базой.

CREATE TABLE week_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  chosen_at TEXT NOT NULL,
  check_at TEXT NOT NULL,
  check_sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'chosen' CHECK (status IN ('chosen', 'done', 'not_yet')),
  answered_at TEXT
);

CREATE INDEX week_steps_user ON week_steps(user_id, id);
CREATE INDEX week_steps_due ON week_steps(status, check_sent_at, check_at);
