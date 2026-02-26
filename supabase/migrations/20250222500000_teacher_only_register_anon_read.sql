-- 新規登録は先生のみ：未登録ユーザー = 先生だけ（auth_profiles がない先生）
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
  WHERE p.app_user_id IS NULL AND u.role = 'teacher'
  ORDER BY u.id;
$$;

-- 生徒・伴奏者は「名前だけで入る」ため anon でもカレンダー等を読めるようにする
CREATE POLICY "day_settings_select_anon" ON day_settings FOR SELECT TO anon USING (true);
CREATE POLICY "lessons_select_anon" ON lessons FOR SELECT TO anon USING (true);
CREATE POLICY "weekly_masters_select_anon" ON weekly_masters FOR SELECT TO anon USING (true);
CREATE POLICY "accompanist_availabilities_select_anon" ON accompanist_availabilities FOR SELECT TO anon USING (true);
