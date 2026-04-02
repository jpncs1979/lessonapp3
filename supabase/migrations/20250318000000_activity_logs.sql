-- 操作ログ（誰が・いつ・何をしたか）。誰でも一覧表示可能
CREATE TABLE IF NOT EXISTS activity_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id       TEXT NOT NULL,
  actor_name     TEXT NOT NULL,
  action         TEXT NOT NULL,
  lesson_id      TEXT,
  lesson_date    TEXT,
  lesson_start_time TEXT,
  details        JSONB
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ログイン済みなら誰でも読める。挿入のみ（更新・削除は不可）
CREATE POLICY "activity_logs_select_authenticated" ON activity_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_logs_insert_authenticated" ON activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);
