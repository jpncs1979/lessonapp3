/** ブラウザから Google カレンダー同期 API を呼ぶ */

export type GoogleCalendarSyncResult = {
  ok: boolean
  message: string
  created?: number
  updated?: number
  deleted?: number
}

const CONNECTED_CACHE_KEY = 'lessonapp3_gcal_connected'
const SYNC_FETCH_TIMEOUT_MS = 3 * 60 * 1000

export function getGoogleCalendarConnectedCache(): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem(CONNECTED_CACHE_KEY)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

export function setGoogleCalendarConnectedCache(connected: boolean): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CONNECTED_CACHE_KEY, connected ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export async function fetchGoogleCalendarConnected(): Promise<boolean> {
  try {
    const r = await fetch('/api/google-calendar/status', { credentials: 'include' })
    const j = (await r.json()) as { connected?: boolean }
    const connected = Boolean(j.connected)
    setGoogleCalendarConnectedCache(connected)
    return connected
  } catch {
    return false
  }
}

function formatSyncMessage(j: {
  ok?: boolean
  created?: number
  updated?: number
  deleted?: number
  errors?: string[]
  error?: string
}): string {
  if (j.error) return j.error
  const parts = [
    j.created ? `新規 ${j.created}` : '',
    j.updated ? `更新 ${j.updated}` : '',
    j.deleted ? `削除 ${j.deleted}` : '',
  ].filter(Boolean)
  const base =
    parts.length > 0
      ? `カレンダー反映（${parts.join(' / ')}）`
      : 'カレンダーは最新です（変更なし）'
  if (j.errors?.length) return `${base} — ${j.errors.join('; ')}`
  return base
}

export async function runGoogleCalendarSync(): Promise<GoogleCalendarSyncResult> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT_MS)
    let r: Response
    try {
      r = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    const j = (await r.json()) as {
      ok: boolean
      created?: number
      updated?: number
      deleted?: number
      errors?: string[]
      error?: string
    }

    if (r.status === 400 && (j.error?.includes('未連携') || j.error?.includes('連携'))) {
      setGoogleCalendarConnectedCache(false)
      return { ok: true, message: '' }
    }

    const ok = r.ok && j.ok && !(j.errors?.length)
    const message = ok
      ? formatSyncMessage(j)
      : (j.error ?? j.errors?.join('; ') ?? 'カレンダー同期に失敗しました')
    if (ok) setGoogleCalendarConnectedCache(true)
    return { ok, message, created: j.created, updated: j.updated, deleted: j.deleted }
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      message: isTimeout
        ? 'カレンダー同期がタイムアウトしました。件数が多い場合は再度お試しください。'
        : e instanceof Error
          ? e.message
          : 'カレンダー同期に失敗しました',
    }
  }
}
