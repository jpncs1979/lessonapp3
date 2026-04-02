-- 生徒・伴奏者が「名前を選択して入る」で予約した内容を保存できるよう、anon で lessons の書き込みを許可する
DROP POLICY IF EXISTS "lessons_insert_anon" ON lessons;
CREATE POLICY "lessons_insert_anon" ON lessons FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "lessons_update_anon" ON lessons;
CREATE POLICY "lessons_update_anon" ON lessons FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "lessons_delete_anon" ON lessons;
CREATE POLICY "lessons_delete_anon" ON lessons FOR DELETE TO anon USING (true);
