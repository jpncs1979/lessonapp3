import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGoogleClientConfig, getGoogleOAuthRedirectUri } from '@/lib/google-calendar/env'
import { getTeacherSession } from '@/lib/google-calendar/teacher-session'
import { createOAuth2ClientForUser, syncLessonsToGoogleCalendar } from '@/lib/google-calendar/sync'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Supabase が設定されていません' }, { status: 503 })
  }

  const teacher = await getTeacherSession(supabase)
  if (!teacher) {
    return NextResponse.json({ ok: false, error: '先生のみ実行できます' }, { status: 403 })
  }

  const { clientId, clientSecret } = getGoogleClientConfig()
  if (!clientId || !clientSecret) {
    return NextResponse.json({ ok: false, error: 'Google API が未設定です' }, { status: 503 })
  }

  const redirectUri = getGoogleOAuthRedirectUri(request.url)
  if (!redirectUri) {
    return NextResponse.json(
      { ok: false, error: 'GOOGLE_REDIRECT_URI または NEXT_PUBLIC_APP_URL を設定してください' },
      { status: 503 }
    )
  }

  const { data: row } = await supabase
    .from('teacher_google_calendar')
    .select('refresh_token')
    .eq('auth_uid', teacher.authUid)
    .maybeSingle()

  if (!row?.refresh_token) {
    return NextResponse.json({ ok: false, error: '先に Google カレンダー連携を完了してください' }, { status: 400 })
  }

  let bodyCalendarId: string | undefined
  try {
    const j = await request.json()
    if (j && typeof j.calendarId === 'string') bodyCalendarId = j.calendarId
  } catch {
    /* empty body */
  }

  const oauth2 = createOAuth2ClientForUser({
    clientId,
    clientSecret,
    redirectUri,
    refreshToken: row.refresh_token,
  })

  const result = await syncLessonsToGoogleCalendar({
    supabase,
    oauth2,
    authUid: teacher.authUid,
    teacherId: teacher.appUserId,
    calendarId: bodyCalendarId,
  })

  const ok = result.errors.length === 0
  return NextResponse.json({
    ok,
    created: result.created,
    updated: result.updated,
    deleted: result.deleted,
    errors: result.errors,
  })
}
