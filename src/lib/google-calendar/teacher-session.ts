import type { SupabaseClient } from '@supabase/supabase-js'

export type TeacherSession = { authUid: string; appUserId: string; teacherName: string }

export async function getTeacherSession(
  supabase: SupabaseClient
): Promise<TeacherSession | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const { data: row } = await supabase
    .from('auth_profiles')
    .select('app_user_id')
    .eq('auth_uid', user.id)
    .single()
  if (!row?.app_user_id) return null
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, name, role')
    .eq('id', row.app_user_id)
    .single()
  if (!appUser || appUser.role !== 'teacher') return null
  return {
    authUid: user.id,
    appUserId: appUser.id,
    teacherName: appUser.name,
  }
}
