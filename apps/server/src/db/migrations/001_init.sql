-- Справочники (загружаются из папки data при старте)

CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  utc_offset_hours INTEGER NOT NULL,
  two_oge_experiment INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  profile_class_rules TEXT,
  profile_class_rules_url TEXT,
  checked_at TEXT
);

CREATE TABLE interests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT,
  sort_order INTEGER NOT NULL
);

CREATE TABLE specialties (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  interest_id TEXT NOT NULL REFERENCES interests(id)
);

CREATE TABLE colleges (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  website TEXT,
  has_dormitory INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX colleges_region_city ON colleges(region_id, city);

-- Программа колледжа: специальность + форма обучения, прошлогодний проходной балл и источник
CREATE TABLE college_specialty (
  id TEXT PRIMARY KEY,
  college_id TEXT NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  specialty_code TEXT NOT NULL REFERENCES specialties(code),
  form TEXT NOT NULL CHECK (form IN ('full_time', 'part_time', 'extramural')),
  duration TEXT,
  budget_places INTEGER,
  passing_score REAL,
  score_year INTEGER,
  entrance_test TEXT,
  source_url TEXT,
  checked_at TEXT
);

CREATE INDEX college_specialty_college ON college_specialty(college_id);
CREATE INDEX college_specialty_specialty ON college_specialty(specialty_code);

CREATE TABLE key_dates (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('federal', 'regional', 'recommendation')),
  region_id TEXT REFERENCES regions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('deadline', 'event', 'period', 'checklist')),
  path TEXT NOT NULL CHECK (path IN ('any', 'school10', 'college')),
  experiment TEXT NOT NULL CHECK (experiment IN ('any', 'two_oge', 'standard')),
  date_start TEXT NOT NULL,
  date_end TEXT,
  is_approximate INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reminders TEXT NOT NULL DEFAULT '[]',
  source_title TEXT,
  source_url TEXT,
  checked_at TEXT
);

CREATE INDEX key_dates_year ON key_dates(academic_year);

-- Пользовательские данные: только ID пользователя в MAX и ответы опроса, без ФИО и оценок

CREATE TABLE users (
  max_user_id INTEGER PRIMARY KEY,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  city TEXT,
  grade INTEGER CHECK (grade IN (8, 9)),
  path TEXT CHECK (path IN ('school10', 'college', 'undecided')),
  interests TEXT NOT NULL DEFAULT '[]',
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  survey_state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(max_user_id) ON DELETE CASCADE,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE plan_item_states (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  key_date_id TEXT NOT NULL REFERENCES key_dates(id) ON DELETE CASCADE,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, key_date_id)
);

-- Подросток или второй родитель, открывший план по ссылке и подписавшийся на напоминания
CREATE TABLE plan_followers (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, user_id)
);

CREATE TABLE favorites (
  user_id INTEGER NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
  college_specialty_id TEXT NOT NULL REFERENCES college_specialty(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, college_specialty_id)
);

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  key_date_id TEXT NOT NULL REFERENCES key_dates(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL CHECK (anchor IN ('start', 'end')),
  days_before INTEGER NOT NULL,
  send_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  UNIQUE (user_id, plan_id, key_date_id, anchor, days_before)
);

CREATE INDEX reminders_due ON reminders(status, send_at);
