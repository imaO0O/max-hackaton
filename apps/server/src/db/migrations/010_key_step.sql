-- Ключевой шаг плана для метрики «реально выполненный шаг»: заявление на ОГЭ до 1 марта.
-- Отмечается в data/key-dates.json полем keyStep. Только добавление столбца — откат безопасен.

ALTER TABLE key_dates ADD COLUMN key_step INTEGER NOT NULL DEFAULT 0;
