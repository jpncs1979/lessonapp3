-- ============================================================
-- レッスンスケジューラー データベーススキーマ
-- ============================================================

-- 拡張機能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. Users テーブル ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'accompanist')),
  department  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Master_Settings テーブル（先生の設定） ──────────────
CREATE TABLE IF NOT EXISTS master_settings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id          UUID NOT NULL REFERENCES users(id),
  date                DATE NOT NULL,
  end_time_mode       TEXT NOT NULL CHECK (end_time_mode IN ('16:30', '20:00')) DEFAULT '16:30',
  lunch_break_open    BOOLEAN DEFAULT FALSE,
  default_room        TEXT NOT NULL DEFAULT '1号館 301室',
  provisional_hours   INTEGER DEFAULT 24 CHECK (provisional_hours IN (24, 48)),
  start_time          TIME DEFAULT '09:00',
  is_lesson_day       BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (teacher_id, date)
);

-- ── 3. Lessons テーブル（レッスン枠） ─────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date                 DATE NOT NULL,
  start_time           TIME NOT NULL,
  end_time             TIME NOT NULL,
  room_name            TEXT NOT NULL,
  teacher_id           UUID NOT NULL REFERENCES users(id),
  student_id           UUID REFERENCES users(id),
  accompanist_id       UUID REFERENCES users(id),
  status               TEXT NOT NULL DEFAULT 'available'
                         CHECK (status IN ('available', 'pending', 'confirmed', 'break', 'lunch', 'blocked')),
  provisional_deadline TIMESTAMPTZ,
  note                 TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 同日同開始時刻の重複を防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS lessons_date_teacher_time
  ON lessons (date, teacher_id, start_time)
  WHERE status != 'blocked';

-- ── 4. Accompanist_Availability テーブル ──────────────────
CREATE TABLE IF NOT EXISTS accompanist_availability (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id      UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  accompanist_id UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lesson_id, accompanist_id)
);

-- ── インデックス ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS lessons_date_idx ON lessons (date);
CREATE INDEX IF NOT EXISTS lessons_student_idx ON lessons (student_id);
CREATE INDEX IF NOT EXISTS lessons_accompanist_idx ON lessons (accompanist_id);
CREATE INDEX IF NOT EXISTS availability_lesson_idx ON accompanist_availability (lesson_id);
CREATE INDEX IF NOT EXISTS availability_accompanist_idx ON accompanist_availability (accompanist_id);

-- ── Row Level Security (RLS) ──────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE accompanist_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_settings ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが読み取り可能
CREATE POLICY "全員が読み取り可能" ON users FOR SELECT USING (true);
CREATE POLICY "全員がレッスンを読み取り可能" ON lessons FOR SELECT USING (true);
CREATE POLICY "全員が可能枠を読み取り可能" ON accompanist_availability FOR SELECT USING (true);
CREATE POLICY "全員が設定を読み取り可能" ON master_settings FOR SELECT USING (true);

-- ── 自動更新トリガー ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON master_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
