-- 「名前を選択して入る」用：登録済みの生徒・伴奏者だけ返す（先生は含めない）
CREATE OR REPLACE FUNCTION public.get_registered_users_for_enter()
RETURNS TABLE(id text, name text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.name, u.role
  FROM public.app_users u
  INNER JOIN public.auth_profiles p ON p.app_user_id = u.id
  WHERE u.role IN ('student', 'accompanist')
  ORDER BY u.id;
$$;

-- 「新規登録」用：名簿にいるがまだ auth_profiles がない人だけ返す
CREATE OR REPLACE FUNCTION public.get_unregistered_users()
RETURNS TABLE(id text, name text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.id, u.name, u.role
  FROM public.app_users u
  LEFT JOIN public.auth_profiles p ON p.app_user_id = u.id
  WHERE p.app_user_id IS NULL
  ORDER BY u.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_registered_users_for_enter() TO anon;
GRANT EXECUTE ON FUNCTION public.get_registered_users_for_enter() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unregistered_users() TO anon;
GRANT EXECUTE ON FUNCTION public.get_unregistered_users() TO authenticated;
