/** 認可コード交換・トークン更新で使う redirect_uri（Google Cloud に登録した URL と完全一致） */
export function getGoogleOAuthRedirectUri(requestUrl?: string): string {
  const fixed = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (fixed) return fixed.replace(/\/$/, '')
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (base) return `${base}/api/google-calendar/callback`
  if (requestUrl) {
    const u = new URL(requestUrl)
    return `${u.origin}/api/google-calendar/callback`
  }
  return ''
}

export function getGoogleClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  return { clientId, clientSecret }
}
