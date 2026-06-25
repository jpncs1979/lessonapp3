-- Google 同期の差分判定用（変更のないレッスンは API を呼ばない）
ALTER TABLE lesson_google_calendar_events
  ADD COLUMN IF NOT EXISTS sync_fingerprint TEXT;
