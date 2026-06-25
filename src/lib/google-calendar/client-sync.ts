/** ブラウザから Google カレンダー同期 API を呼ぶ */

export type GoogleCalendarSyncResult = {
  ok: boolean
  message: string
  created?: number
  updated?: number
  deleted?: number
}

const CONNECTED_CACHE_KEY = 'lessonapp3_gcal_connected'
const STATUS_FETCH_TIMEOUT_MS = 12_000
const CHUNK_FETCH_TIMEOUT_MS = 55_000
const DEFAULT_CHUNK_SIZE = 25

/** ブラウザのローカル日付（同期ボタンを押した日） */
function getLocalSyncFromDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ response: Response; json: T }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const json = (await response.json()) as T
    return { response, json }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchGoogleCalendarConnected(): Promise<boolean> {
  try {
    const { json } = await fetchJsonWithTimeout<{ connected?: boolean }>(
      '/api/google-calendar/status',
      { credentials: 'include' },
      STATUS_FETCH_TIMEOUT_MS
    )
    const connected = Boolean(json.connected)
    setGoogleCalendarConnectedCache(connected)
    return connected
  } catch {
    return false
  }
}

type SyncApiResponse = {
  ok?: boolean
  created?: number
  updated?: number
  deleted?: number
  linked?: number
  errors?: string[]
  error?: string
  complete?: boolean
  nextOffset?: number
  totalWork?: number
  processed?: number
  skippedUnchanged?: number
  needsReconnect?: boolean
  syncFromDate?: string
}

function formatSyncMessage(
  totals: {
    created: number
    updated: number
    deleted: number
    linked: number
    skippedUnchanged: number
  },
  errors?: string[]
): string {
  if (errors?.length) return errors.join('; ')
  const parts = [
    totals.created ? `新規 ${totals.created}` : '',
    totals.updated ? `更新 ${totals.updated}` : '',
    totals.deleted ? `削除 ${totals.deleted}` : '',
    totals.linked ? `既存と紐づけ ${totals.linked}` : '',
  ].filter(Boolean)
  if (parts.length > 0) {
    return `カレンダー反映（${parts.join(' / ')}）`
  }
  if (totals.skippedUnchanged > 0) {
    return `カレンダーは最新です（${totals.skippedUnchanged}件は変更なし）`
  }
  return 'カレンダーは最新です（変更なし）'
}

export async function runGoogleCalendarSync(): Promise<GoogleCalendarSyncResult> {
  const totals = { created: 0, updated: 0, deleted: 0, linked: 0, skippedUnchanged: 0 }
  const allErrors: string[] = []
  let offset = 0
  const syncFromDate = getLocalSyncFromDate()

  try {
    for (let round = 0; round < 500; round++) {
      const { response: r, json: j } = await fetchJsonWithTimeout<SyncApiResponse>(
        '/api/google-calendar/sync',
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: DEFAULT_CHUNK_SIZE, syncFromDate }),
        },
        CHUNK_FETCH_TIMEOUT_MS
      )

      if (r.status === 400 && (j.error?.includes('未連携') || j.error?.includes('連携'))) {
        setGoogleCalendarConnectedCache(false)
        return { ok: false, message: j.error ?? 'Google カレンダーが未連携です' }
      }

      if (j.needsReconnect) {
        setGoogleCalendarConnectedCache(false)
        const message = j.errors?.[0] ?? 'Google カレンダー連携が無効です。設定から再連携してください。'
        return { ok: false, message }
      }

      if (!r.ok) {
        const message = j.error ?? j.errors?.join('; ') ?? 'カレンダー同期に失敗しました'
        return { ok: false, message }
      }

      totals.created += j.created ?? 0
      totals.updated += j.updated ?? 0
      totals.deleted += j.deleted ?? 0
      totals.linked += j.linked ?? 0
      if (round === 0 && typeof j.skippedUnchanged === 'number') {
        totals.skippedUnchanged = j.skippedUnchanged
      }
      if (j.errors?.length) {
        allErrors.push(...j.errors)
        if (j.errors.some((e) => /invalid_grant|連携が無効/i.test(e))) {
          setGoogleCalendarConnectedCache(false)
          return { ok: false, message: j.errors[0] }
        }
      }

      if (j.complete !== false) {
        const ok = (j.ok ?? true) && allErrors.length === 0
        const message = ok ? formatSyncMessage(totals, undefined) : formatSyncMessage(totals, allErrors)
        if (ok) setGoogleCalendarConnectedCache(true)
        return {
          ok,
          message,
          created: totals.created,
          updated: totals.updated,
          deleted: totals.deleted,
        }
      }

      offset = typeof j.nextOffset === 'number' ? j.nextOffset : offset + DEFAULT_CHUNK_SIZE
    }

    return {
      ok: false,
      message: '同期が完了しませんでした。再度お試しください。',
    }
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      message: isTimeout
        ? 'カレンダー同期がタイムアウトしました。通信状況を確認して再度お試しください。'
        : e instanceof Error
          ? e.message
          : 'カレンダー同期に失敗しました',
    }
  }
}
