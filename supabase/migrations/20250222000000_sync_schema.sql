-- ============================================================
-- レッスンスケジューラー Supabase 同期用スキーマ
-- アプリの文字列ID（teacher-1, student-1 等）をそのまま使用
-- ============================================================

-- 名簿：先生・生徒・伴奏者（id はアプリと一致させる）
CREATE TABLE IF NOT EXISTS app_users (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'accompanist'))
);

-- Supabase Auth と名簿の紐付け（メールでサインアップした人 → どの app_user か）
CREATE TABLE IF NOT EXISTS auth_profiles (
  auth_uid    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_user_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  UNIQUE (app_user_id)
);

-- 日別設定（レッスン日か、開始・終了時刻など）
CREATE TABLE IF NOT EXISTS day_settings (
  date              TEXT PRIMARY KEY,
  end_time_mode     TEXT NOT NULL DEFAULT '20:00' CHECK (end_time_mode IN ('16:30', '20:00')),
  lunch_break_open  BOOLEAN NOT NULL DEFAULT FALSE,
  default_room      TEXT NOT NULL DEFAULT '1号館120',
  provisional_hours INTEGER NOT NULL DEFAULT 24 CHECK (provisional_hours IN (24, 48)),
  start_time        TEXT NOT NULL DEFAULT '09:00',
  is_lesson_day     BOOLEAN NOT NULL DEFAULT FALSE
);

-- レッスン枠
CREATE TABLE IF NOT EXISTS lessons (
  id                   TEXT PRIMARY KEY,
  date                 TEXT NOT NULL,
  start_time           TEXT NOT NULL,
  end_time             TEXT NOT NULL,
  room_name            TEXT NOT NULL,
  teacher_id            TEXT NOT NULL,
  student_id            TEXT,
  accompanist_id       TEXT,
  status               TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'pending', 'confirmed', 'break', 'lunch', 'blocked')),
  provisional_deadline TIMESTAMPTZ,
  note                 TEXT
);

CREATE INDEX IF NOT EXISTS lessons_date_idx ON lessons (date);

-- 週間マスター（曜日・スロット・受講生）
CREATE TABLE IF NOT EXISTS weekly_masters (
  day_of_week  INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  slot_index   INTEGER NOT NULL,
  student_id   TEXT NOT NULL,
  PRIMARY KEY (day_of_week, slot_index)
);

-- 伴奏者の「可能」枠
CREATE TABLE IF NOT EXISTS accompanist_availabilities (
  id             TEXT PRIMARY KEY,
  slot_id        TEXT NOT NULL,
  accompanist_id TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS avail_slot_idx ON accompanist_availabilities (slot_id);
CREATE INDEX IF NOT EXISTS avail_accompanist_idx ON accompanist_availabilities (accompanist_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE accompanist_availabilities ENABLE ROW LEVEL SECURITY;

-- 名簿は未ログインでも読める（名前選択画面用）
DROP POLICY IF EXISTS "app_users_select_anon" ON app_users;
CREATE POLICY "app_users_select_anon" ON app_users FOR SELECT USING (true);
DROP POLICY IF EXISTS "app_users_all_authenticated" ON app_users;
CREATE POLICY "app_users_all_authenticated" ON app_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 自分の auth_profiles のみ
DROP POLICY IF EXISTS "auth_profiles_insert_own" ON auth_profiles;
CREATE POLICY "auth_profiles_insert_own" ON auth_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_uid);
DROP POLICY IF EXISTS "auth_profiles_select_own" ON auth_profiles;
CREATE POLICY "auth_profiles_select_own" ON auth_profiles FOR SELECT TO authenticated
  USING (auth.uid() = auth_uid);

-- 日設定・レッスン・週間マスター・可能枠はログイン済みなら読み書き可
DROP POLICY IF EXISTS "day_settings_policy" ON day_settings;
CREATE POLICY "day_settings_policy" ON day_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "lessons_policy" ON lessons;
CREATE POLICY "lessons_policy" ON lessons FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "weekly_masters_policy" ON weekly_masters;
CREATE POLICY "weekly_masters_policy" ON weekly_masters FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "accompanist_availabilities_policy" ON accompanist_availabilities;
CREATE POLICY "accompanist_availabilities_policy" ON accompanist_availabilities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 初期名簿（1先生・複数生徒・複数伴奏者）※既に存在する場合はスキップ
INSERT INTO app_users (id, name, role) VALUES
  ('teacher-1', '大和田 智彦', 'teacher'),
  ('student-1', '田中 花子', 'student'),
  ('student-2', '鈴木 太郎', 'student'),
  ('student-3', '山田 美咲', 'student'),
  ('student-4', '伊藤 健一', 'student'),
  ('student-5', '渡辺 由里子', 'student'),
  ('accompanist-1', '中村 雅子', 'accompanist'),
  ('accompanist-2', '小林 健太', 'accompanist')
ON CONFLICT (id) DO NOTHING;
