-- Перечень эксперимента с двумя ОГЭ: год и источник у региона, отметка у колледжа и программы.
-- Только добавление столбцов: предыдущая версия кода продолжает работать с этой базой.

ALTER TABLE regions ADD COLUMN experiment_list_year INTEGER;
ALTER TABLE regions ADD COLUMN experiment_list_url TEXT;
ALTER TABLE regions ADD COLUMN experiment_list_checked_at TEXT;
ALTER TABLE colleges ADD COLUMN in_experiment_list INTEGER NOT NULL DEFAULT 0;
ALTER TABLE college_specialty ADD COLUMN in_experiment_list INTEGER NOT NULL DEFAULT 0;
