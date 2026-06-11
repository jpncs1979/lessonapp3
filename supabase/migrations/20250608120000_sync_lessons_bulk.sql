-- レッスン差分を 1 回の RPC で同期（全件 upsert + 全 ID 取得を避ける）
-- 大量 upsert 時は change log トリガーをスキップして DB 負荷を抑える

CREATE OR REPLACE FUNCTION public.log_lesson_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.bulk_lesson_sync', true), '') = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.lesson_change_log (op, lesson_id, old_row, new_row, auth_uid)
    VALUES ('DELETE', OLD.id, to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.lesson_change_log (op, lesson_id, old_row, new_row, auth_uid)
    VALUES ('UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.lesson_change_log (op, lesson_id, old_row, new_row, auth_uid)
    VALUES ('INSERT', NEW.id, NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_lessons_bulk(
  p_upserts jsonb,
  p_delete_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.auth_profiles ap
    JOIN public.app_users u ON u.id = ap.app_user_id
    WHERE ap.auth_uid = auth.uid()
      AND u.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Only teacher can sync lessons';
  END IF;

  PERFORM set_config('app.bulk_lesson_sync', 'true', true);

  IF p_delete_ids IS NOT NULL AND array_length(p_delete_ids, 1) > 0 THEN
    DELETE FROM public.lessons WHERE id = ANY (p_delete_ids);
  END IF;

  IF p_upserts IS NOT NULL AND jsonb_typeof(p_upserts) = 'array' AND jsonb_array_length(p_upserts) > 0 THEN
    INSERT INTO public.lessons (
      id,
      date,
      start_time,
      end_time,
      room_name,
      teacher_id,
      student_id,
      accompanist_id,
      status,
      provisional_deadline,
      note
    )
    SELECT
      x->>'id',
      x->>'date',
      x->>'start_time',
      x->>'end_time',
      x->>'room_name',
      x->>'teacher_id',
      NULLIF(x->>'student_id', ''),
      NULLIF(x->>'accompanist_id', ''),
      x->>'status',
      NULLIF(x->>'provisional_deadline', '')::timestamptz,
      NULLIF(x->>'note', '')
    FROM jsonb_array_elements(p_upserts) AS x
    ON CONFLICT (id) DO UPDATE SET
      date = EXCLUDED.date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      room_name = EXCLUDED.room_name,
      teacher_id = EXCLUDED.teacher_id,
      student_id = EXCLUDED.student_id,
      accompanist_id = EXCLUDED.accompanist_id,
      status = EXCLUDED.status,
      provisional_deadline = EXCLUDED.provisional_deadline,
      note = EXCLUDED.note;
  END IF;

  PERFORM set_config('app.bulk_lesson_sync', 'false', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_lessons_bulk(jsonb, text[]) TO authenticated;
