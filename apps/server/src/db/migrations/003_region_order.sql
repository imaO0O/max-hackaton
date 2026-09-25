-- Порядок регионов в опросе — как в data/regions.json: пилотный регион первым, демо-регионы в конце.
-- Только добавление столбца: предыдущая версия кода продолжает работать с этой базой.

ALTER TABLE regions ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
