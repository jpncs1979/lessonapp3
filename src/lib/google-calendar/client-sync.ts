/** ブラウザから Google カレンダー同期 API を呼び、結果を sessionStorage に残す（ページ移動後も確認可） */

export type GoogleCalendarSyncSnapshot = {
  status: 'running' | 'done' | 'error'
  startedAt: string
  completedAt?: string
  ok: boolean
  message: string
  created?: number
  updated?: number
  deleted?: number
}

const STORAGE_KEY = 'lessonapp3_gcal_sync_snapshot'
const CONNECTED_CACHE_KEY = 'lessonapp3_gcal_connected'

const SYNC_FETCH_TIMEOUT_MS = 3 * 60 * 1000
/** ページ再読み込み等で中断された running スナップショットを除去 */
const STALE_RUNNING_MS = 30_000

export function readGoogleCalendarSyncSnapshot(): GoogleCalendarSyncSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as GoogleCalendarSyncSnapshot
    if (snap.status === 'running') {
      const age = Date.now() - new Date(snap.startedAt).getTime()
      if (age > STALE_RUNNING_MS) {
        sessionStorage.removeItem(STORAGE_KEY)
        return null
      }
    }
    return snap
  } catch {
    return null
  }
}

/** マウント時: 前回のページで中断された「同期中」を消す */
export function clearOrphanedRunningSnapshot(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const snap = JSON.parse(raw) as GoogleCalendarSyncSnapshot
    if (snap.status === 'running') {
      sessionStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('lessonapp3-gcal-sync'))
    }
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
  }
}

export function writeGoogleCalendarSyncSnapshot(snapshot: GoogleCalendarSyncSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    window.dispatchEvent(new CustomEvent('lessonapp3-gcal-sync'))
  } catch {
    /* ignore */
  }
}

export function clearGoogleCalendarSyncSnapshot(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('lessonapp3-gcal-sync'))
  } catch {
    /* ignore */
  }
}

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
      ? `Google カレンダーに反映しました（${parts.join(' / ')}）`
      : 'Google カレンダーを確認しました（変更はありませんでした）'
  if (j.errors?.length) return `${base} — ${j.errors.join('; ')}`
  return base
}

export async function runGoogleCalendarSync(): Promise<GoogleCalendarSyncSnapshot> {
  const startedAt = new Date().toISOString()

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
      const snap: GoogleCalendarSyncSnapshot = {
        status: 'done',
        startedAt,
        completedAt: new Date().toISOString(),
        ok: true,
        message: '',
        created: 0,
        updated: 0,
        deleted: 0,
      }
      clearGoogleCalendarSyncSnapshot()
      return snap
    }

    const ok = r.ok && j.ok && !(j.errors?.length)
    const snap: GoogleCalendarSyncSnapshot = {
      status: ok ? 'done' : 'error',
      startedAt,
      completedAt: new Date().toISOString(),
      ok,
      message: ok ? formatSyncMessage(j) : (j.error ?? j.errors?.join('; ') ?? '同期に失敗しました'),
      created: j.created,
      updated: j.updated,
      deleted: j.deleted,
    }
    writeGoogleCalendarSyncSnapshot(snap)
    if (ok) setGoogleCalendarConnectedCache(true)
    return snap
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    const snap: GoogleCalendarSyncSnapshot = {
      status: 'error',
      startedAt,
      completedAt: new Date().toISOString(),
      ok: false,
      message: isTimeout
        ? '同期がタイムアウトしました。件数が多い場合は「今すぐ同期」を再度お試しください。'
        : e instanceof Error
          ? e.message
          : '同期に失敗しました',
    }
    writeGoogleCalendarSyncSnapshot(snap)
    return snap
  }
}
