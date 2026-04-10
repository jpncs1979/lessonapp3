import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGoogleClientConfig, getGoogleOAuthRedirectUri } from '@/lib/google-calendar/env'
import { getTeacherSession } from '@/lib/google-calendar/teacher-session'

const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase が設定されていません' }, { status: 503 })
  }

  const teacher = await getTeacherSession(supabase)
  if (!teacher) {
    const u = new URL('/teacher-login', request.url)
    u.searchParams.set('error', 'google_calendar_teacher_only')
    return NextResponse.redirect(u)
  }

  const { clientId, clientSecret } = getGoogleClientConfig()
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です' },
      { status: 503 }
    )
  }

  const redirectUri = getGoogleOAuthRedirectUri(request.url)
  if (!redirectUri) {
    return NextResponse.json(
      { error: 'GOOGLE_REDIRECT_URI または NEXT_PUBLIC_APP_URL を設定してください' },
      { status: 503 }
    )
  }

  const state = randomBytes(24).toString('hex')
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.searchParams.set('client_id', clientId)
  auth.searchParams.set('redirect_uri', redirectUri)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('scope', SCOPE)
  auth.searchParams.set('state', state)
  auth.searchParams.set('access_type', 'offline')
  auth.searchParams.set('prompt', 'consent')
  auth.searchParams.set('include_granted_scopes', 'true')

  const res = NextResponse.redirect(auth.toString())
  res.cookies.set('gcal_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
