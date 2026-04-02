-- ログの削除は先生のみ可能
CREATE POLICY "activity_logs_delete_teacher" ON activity_logs
  FOR DELETE TO authenticated
  USING (
    (SELECT au.role FROM auth_profiles ap
     JOIN app_users au ON au.id = ap.app_user_id
     WHERE ap.auth_uid = auth.uid()) = 'teacher'
  );
