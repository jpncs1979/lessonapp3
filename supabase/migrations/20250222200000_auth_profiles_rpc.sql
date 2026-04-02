-- クライアントから「自分の auth_profiles を1行挿入する」ための RPC。
-- サインアップ直後に呼び、RLS を避けて確実に登録する。

CREATE OR REPLACE FUNCTION public.insert_my_auth_profile(p_app_user_id text, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.auth_profiles (auth_uid, app_user_id, email)
  VALUES (auth.uid(), p_app_user_id, trim(p_email))
  ON CONFLICT (auth_uid) DO UPDATE SET
    app_user_id = EXCLUDED.app_user_id,
    email = EXCLUDED.email;
END;
$$;

-- ログイン済みユーザーだけが実行可能
GRANT EXECUTE ON FUNCTION public.insert_my_auth_profile(text, text) TO authenticated;
