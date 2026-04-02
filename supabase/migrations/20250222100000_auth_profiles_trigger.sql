-- auth.users に新規ユーザーが追加されたときに、public.auth_profiles に1行挿入する。
-- クライアントからは RLS で弾かれることがあるため、DB 側のトリガーで行う。

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_id text;
  user_email text;
BEGIN
  app_id := COALESCE(NEW.raw_user_meta_data->>'app_user_id', '');
  user_email := COALESCE(NEW.raw_user_meta_data->>'email', NEW.email, '');
  IF app_id <> '' THEN
    INSERT INTO public.auth_profiles (auth_uid, app_user_id, email)
    VALUES (NEW.id, app_id, user_email)
    ON CONFLICT (auth_uid) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- auth.users への AFTER INSERT トリガー（Supabase では auth スキーマにトリガーを張る）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();
