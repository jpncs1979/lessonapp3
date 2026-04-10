import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGoogleClientConfig, getGoogleOAuthRedirectUri } from '@/lib/google-calendar/env'
import { getTeacherSession } from '@/lib/google-calendar/teacher-session'
import { createOAuth2ClientForUser } from '@/lib/google-calendar/sync'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'Supabase が設定されていません' }, { status: 503 })
  }

  const teacher = await getTeacherSession(supabase)
  if (!teacher) {
    return NextResponse.json({ ok: false, error: '先生のみ実行できます' }, { status: 403 })
  }

  const { data: maps } = await supabase
    .from('lesson_google_calendar_events')
    .select('lesson_id, google_event_id, calendar_id')
    .eq('auth_uid', teacher.authUid)

  const { data: tokenRow } = await supabase
    .from('teacher_google_calendar')
    .select('refresh_token')
    .eq('auth_uid', teacher.authUid)
    .maybeSingle()

  const { clientId, clientSecret } = getGoogleClientConfig()
  const redirectUri = getGoogleOAuthRedirectUri(request.url)

  let remoteErrors = 0
  if (tokenRow?.refresh_token && clientId && clientSecret && redirectUri) {
    try {
      const oauth2 = createOAuth2ClientForUser({
        clientId,
        clientSecret,
        redirectUri,
        refreshToken: tokenRow.refresh_token,
      })
      const calApi = google.calendar({ version: 'v3', auth: oauth2 })
      for (const m of maps ?? []) {
        try {
          await calApi.events.delete({
            calendarId: m.calendar_id || 'primary',
            eventId: m.google_event_id,
          })
        } catch {
          remoteErrors++
        }
      }
    } catch {
      remoteErrors++
    }
  }

  await supabase.from('lesson_google_calendar_events').delete().eq('auth_uid', teacher.authUid)
  await supabase.from('teacher_google_calendar').delete().eq('auth_uid', teacher.authUid)

  return NextResponse.json({
    ok: true,
    removedMappings: maps?.length ?? 0,
    remoteErrors,
  })
}
