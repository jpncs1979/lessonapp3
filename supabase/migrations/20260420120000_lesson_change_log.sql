-- レッスン行の INSERT/UPDATE/DELETE を DB 側で確実に記録（クライアント経由の全削除も追跡可能）
-- auth.uid() は認証ユーザーにのみ入る。anon の名前のみ入場時は NULL。
--
-- Supabase SQL エディタでは、先頭の CREATE TABLE から末尾の GRANT までを「一度の Run」で実行してください。
-- CREATE FUNCTION の途中だけを選択して実行すると、PL/pgSQL の変数が無い文脈になり
-- relation "…" does not exist（実際はテーブルではなく変数名）というエラーになります。

CREATE TABLE IF NOT EXISTS public.lesson_change_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  lesson_id text NOT NULL,
  old_row jsonb,
  new_row jsonb,
  auth_uid uuid
);

CREATE INDEX IF NOT EXISTS lesson_change_log_occurred_at_idx
  ON public.lesson_change_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS lesson_change_log_lesson_id_idx
  ON public.lesson_change_log (lesson_id);

COMMENT ON TABLE public.lesson_change_log IS 'lessons テーブルへの変更履歴（トリガーで記録）。auth_uid が NULL の操作は anon（名前のみ入場等）';

CREATE OR REPLACE FUNCTION public.log_lesson_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS lesson_change_log_trigger ON public.lessons;
CREATE TRIGGER lesson_change_log_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.lessons
FOR EACH ROW
EXECUTE PROCEDURE public.log_lesson_change();

ALTER TABLE public.lesson_change_log ENABLE ROW LEVEL SECURITY;

-- クライアントから直接読ませない（RPC の SECURITY DEFINER のみ参照）
DROP POLICY IF EXISTS "lesson_change_log_no_select" ON public.lesson_change_log;
CREATE POLICY "lesson_change_log_no_select" ON public.lesson_change_log
FOR SELECT TO authenticated, anon
USING (false);

CREATE OR REPLACE FUNCTION public.get_lesson_change_log_for_teacher(p_limit int DEFAULT 500)
RETURNS TABLE (
  id bigint,
  occurred_at timestamptz,
  op text,
  lesson_id text,
  old_row jsonb,
  new_row jsonb,
  auth_uid uuid,
  actor_app_user_id text,
  actor_name text,
  actor_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
    RAISE EXCEPTION 'Only teacher can access lesson change log';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.occurred_at,
    l.op,
    l.lesson_id,
    l.old_row,
    l.new_row,
    l.auth_uid,
    ap.app_user_id AS actor_app_user_id,
    au.name AS actor_name,
    ap.email AS actor_email
  FROM public.lesson_change_log l
  LEFT JOIN public.auth_profiles ap ON ap.auth_uid = l.auth_uid
  LEFT JOIN public.app_users au ON au.id = ap.app_user_id
  ORDER BY l.occurred_at DESC, l.id DESC
  LIMIT LEAST(2000, GREATEST(1, COALESCE(NULLIF(p_limit, 0), 500)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lesson_change_log_for_teacher(int) TO authenticated;
