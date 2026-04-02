-- 伴奏者が「可能」枠を設定したときに anon から保存できるようにする（先生・生徒側に反映するため）
CREATE OR REPLACE FUNCTION public.set_accompanist_availabilities(
  p_accompanist_id text,
  p_slot_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM accompanist_availabilities WHERE accompanist_id = p_accompanist_id;
  IF array_length(p_slot_ids, 1) > 0 THEN
    INSERT INTO accompanist_availabilities (id, slot_id, accompanist_id, created_at)
    SELECT gen_random_uuid()::text, s, p_accompanist_id, NOW()
    FROM unnest(p_slot_ids) AS s;
  END IF;
END;
$$;

-- anon でも実行可能（名前のみで入った伴奏者が可能枠を保存するため）
GRANT EXECUTE ON FUNCTION public.set_accompanist_availabilities(text, text[]) TO anon;
