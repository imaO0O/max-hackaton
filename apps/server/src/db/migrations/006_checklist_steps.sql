-- Шаги чек-листа у пункта плана (например, летний чек-лист поступления) и их отметки.
-- Только добавление: предыдущая версия кода продолжает работать с этой базой.

ALTER TABLE key_dates ADD COLUMN steps TEXT;

CREATE TABLE plan_step_states (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  key_date_id TEXT NOT NULL REFERENCES key_dates(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, key_date_id, step_id)
);
