import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { OAuth2Client } from 'google-auth-library'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGoogleClientConfig, getGoogleOAuthRedirectUri } from '@/lib/google-calendar/env'
import { getTeacherSession } from '@/lib/google-calendar/teacher-session'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  const fail = (msg: string) => {
    const u = new URL('/settings/google-calendar', request.url)
    u.searchParams.set('google', 'error')
    u.searchParams.set('msg', msg)
    return NextResponse.redirect(u)
  }

  if (err) return fail(`Google: ${err}`)
  if (!code || !state) return fail('認可コードがありません')

  const supabase = await createSupabaseServerClient()
  if (!supabase) return fail('Supabase が設定されていません')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('gcal_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return fail('セキュリティ検証に失敗しました（state）。もう一度連携を試してください。')
  }

  const teacher = await getTeacherSession(supabase)
  if (!teacher) return fail('先生アカウントでのみ連携できます')

  const { clientId, clientSecret } = getGoogleClientConfig()
  if (!clientId || !clientSecret) return fail('Google API の環境変数が未設定です')

  const redirectUri = getGoogleOAuthRedirectUri(request.url)
  if (!redirectUri) return fail('GOOGLE_REDIRECT_URI または NEXT_PUBLIC_APP_URL を設定してください')

  const oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri)
  let tokens
  try {
    const r = await oauth2.getToken(code)
    tokens = r.tokens
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'トークン取得に失敗しました')
  }

  const refresh = tokens.refresh_token
  if (!refresh) {
    return fail(
      'リフレッシュトークンが返りませんでした。Google アカウントの連携を一度解除してから、再度「連携する」を試してください。'
    )
  }

  const { error: upsertErr } = await supabase.from('teacher_google_calendar').upsert(
    {
      auth_uid: teacher.authUid,
      refresh_token: refresh,
      calendar_id: 'primary',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'auth_uid' }
  )

  if (upsertErr) {
    return fail(upsertErr.message)
  }

  const ok = new URL('/settings/google-calendar', request.url)
  ok.searchParams.set('google', 'connected')

  const res = NextResponse.redirect(ok.toString())
  res.cookies.set('gcal_oauth_state', '', { httpOnly: true, maxAge: 0, path: '/' })
  return res
}
