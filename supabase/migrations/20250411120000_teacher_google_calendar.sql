-- Google Calendar OAuth トークン（ログイン中の auth ユーザーごと）
CREATE TABLE IF NOT EXISTS teacher_google_calendar (
  auth_uid       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL,
  calendar_id    TEXT NOT NULL DEFAULT 'primary',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_google_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_google_calendar_own" ON teacher_google_calendar;
CREATE POLICY "teacher_google_calendar_own" ON teacher_google_calendar
  FOR ALL TO authenticated
  USING (auth_uid = auth.uid())
  WITH CHECK (auth_uid = auth.uid());

-- レッスン枠と Google イベント ID の対応（差分更新・削除用）
CREATE TABLE IF NOT EXISTS lesson_google_calendar_events (
  auth_uid         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id        TEXT NOT NULL,
  google_event_id  TEXT NOT NULL,
  calendar_id      TEXT NOT NULL DEFAULT 'primary',
  PRIMARY KEY (auth_uid, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_google_calendar_events_auth_idx
  ON lesson_google_calendar_events (auth_uid);

ALTER TABLE lesson_google_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_google_calendar_events_own" ON lesson_google_calendar_events;
CREATE POLICY "lesson_google_calendar_events_own" ON lesson_google_calendar_events
  FOR ALL TO authenticated
  USING (auth_uid = auth.uid())
  WITH CHECK (auth_uid = auth.uid());
