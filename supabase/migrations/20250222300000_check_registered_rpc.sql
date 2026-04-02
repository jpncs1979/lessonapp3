-- 未ログインでも「この名前（app_user_id）は登録済みか」だけ分かるようにする RPC。
-- メールなどは返さず true/false だけ返すので、anon に公開してよい。

CREATE OR REPLACE FUNCTION public.check_app_user_registered(p_app_user_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS(SELECT 1 FROM public.auth_profiles WHERE app_user_id = p_app_user_id);
$$;

-- 未ログイン（anon）でも実行可能（名前選択画面で「登録済みならログイン」を出すため）
GRANT EXECUTE ON FUNCTION public.check_app_user_registered(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_app_user_registered(text) TO authenticated;
