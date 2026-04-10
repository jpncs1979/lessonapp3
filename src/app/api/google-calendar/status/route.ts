import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getTeacherSession } from '@/lib/google-calendar/teacher-session'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, connected: false, reason: 'no_supabase' })
  }
  const teacher = await getTeacherSession(supabase)
  if (!teacher) {
    return NextResponse.json({ ok: true, connected: false, reason: 'not_teacher' })
  }
  const { data } = await supabase
    .from('teacher_google_calendar')
    .select('calendar_id, updated_at')
    .eq('auth_uid', teacher.authUid)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    connected: !!data,
    calendarId: data?.calendar_id ?? null,
    updatedAt: data?.updated_at ?? null,
  })
}
