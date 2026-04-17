-- 先生が、先生・生徒・伴奏者を含む全員の最終ログイン時刻を取得する RPC

CREATE OR REPLACE FUNCTION public.get_all_login_history_for_teacher()
RETURNS TABLE (
  app_user_id text,
  name text,
  role text,
  email text,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  requester_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.role
    INTO requester_role
  FROM public.auth_profiles ap
  JOIN public.app_users u ON u.id = ap.app_user_id
  WHERE ap.auth_uid = auth.uid();

  IF requester_role IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'Only teacher can access login history';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS app_user_id,
    u.name,
    u.role,
    ap.email,
    au.last_sign_in_at
  FROM public.app_users u
  LEFT JOIN public.auth_profiles ap
    ON ap.app_user_id = u.id
  LEFT JOIN auth.users au
    ON au.id = ap.auth_uid
  ORDER BY COALESCE(au.last_sign_in_at, 'epoch'::timestamptz) DESC, u.id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_login_history_for_teacher() TO authenticated;
