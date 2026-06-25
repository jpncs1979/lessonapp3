import { createHash } from 'crypto'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LessonSlot } from '@/types'
import { normalizePendingToConfirmed } from '@/lib/utils'

/** Calendar API のレート制限対策（チャンク内は短め） */
const GOOGLE_CALENDAR_MIN_INTERVAL_MS = Math.max(
  120,
  Number(process.env.GOOGLE_CALENDAR_SYNC_INTERVAL_MS) || 200
)

export const GOOGLE_CALENDAR_INVALID_GRANT_MESSAGE =
  'Google カレンダー連携が無効になりました。設定画面で「連携解除」してから、再度「連携する」をお試しください。'

let lastGoogleCalendarApiAt = 0

export async function paceGoogleCalendarApi(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastGoogleCalendarApiAt
  const wait = Math.max(0, GOOGLE_CALENDAR_MIN_INTERVAL_MS - elapsed)
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  lastGoogleCalendarApiAt = Date.now()
}

function isGoogleCalendarQuotaError(message: string): boolean {
  return /quota exceeded|Queries per minute|rateLimitExceeded|userRateLimitExceeded|429/i.test(message)
}

function isInvalidGrantError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  if (/invalid_grant/i.test(msg)) return true
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const data = (e as { response?: { data?: { error?: string } } }).response?.data
    if (data?.error === 'invalid_grant') return true
  }
  return false
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function clearStaleGoogleCalendarAuth(
  supabase: SupabaseClient,
  authUid: string
): Promise<void> {
  await supabase.from('teacher_google_calendar').delete().eq('auth_uid', authUid)
}

async function verifyGoogleOAuthAccess(
  oauth2: OAuth2Client,
  supabase: SupabaseClient,
  authUid: string
): Promise<string | null> {
  try {
    await oauth2.getAccessToken()
    return null
  } catch (e) {
    if (isInvalidGrantError(e)) {
      await clearStaleGoogleCalendarAuth(supabase, authUid)
      return GOOGLE_CALENDAR_INVALID_GRANT_MESSAGE
    }
    return errorMessage(e)
  }
}

function dedupeCalendarErrors(errors: string[]): string[] {
  if (!errors.length) return errors
  if (errors.some((e) => /invalid_grant/i.test(e))) {
    return [GOOGLE_CALENDAR_INVALID_GRANT_MESSAGE]
  }
  const quotaHits = errors.filter((e) => isGoogleCalendarQuotaError(e))
  if (quotaHits.length === 0) return errors
  const rest = errors.filter((e) => !isGoogleCalendarQuotaError(e))
  return [
    ...rest,
    'Google Calendar API の1分あたりの呼び出し上限に達しました。1〜2分待ってから再度お試しください。',
  ]
}

type DbLesson = {
  id: string
  date: string
  start_time: string
  end_time: string
  room_name: string
  teacher_id: string
  student_id: string | null
  accompanist_id: string | null
  status: string
  note: string | null
}

type MappingRow = {
  lesson_id: string
  google_event_id: string
  calendar_id: string
  sync_fingerprint?: string | null
}

type SyncWorkDelete = { kind: 'delete'; lessonId: string; map: MappingRow }
type SyncWorkInsert = { kind: 'insert'; lesson: LessonSlot; fingerprint: string; body: EventBody }
type SyncWorkUpdate = {
  kind: 'update'
  lesson: LessonSlot
  map: MappingRow
  fingerprint: string
  body: EventBody
}
/** DB の対応だけ更新（Google 上の予定は触らない） */
type SyncWorkLink = {
  kind: 'link'
  lesson: LessonSlot
  map: MappingRow
  fingerprint: string
}
type SyncWorkItem = SyncWorkDelete | SyncWorkInsert | SyncWorkUpdate | SyncWorkLink

type EventBody = {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties: { private: { lessonAppLessonId: string; lessonAppTeacherId: string } }
}

function shouldSyncLesson(l: LessonSlot): boolean {
  if (!l.studentId) return false
  return l.status === 'confirmed'
}

function toLessonSlot(r: DbLesson): LessonSlot {
  return {
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    roomName: r.room_name,
    teacherId: r.teacher_id,
    studentId: r.student_id ?? undefined,
    accompanistId: r.accompanist_id ?? undefined,
    status: r.status as LessonSlot['status'],
    note: r.note ?? undefined,
  }
}

function buildDateTime(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${date}T${hh}:${mm}:00`
}

function buildSummary(
  lesson: LessonSlot,
  names: { student?: string; accompanist?: string }
): string {
  const st = names.student ?? '生徒'
  const acc = lesson.accompanistId ? `（伴奏: ${names.accompanist ?? '伴奏者'}）` : ''
  return `${st}${acc}`
}

function buildDescription(lesson: LessonSlot): string {
  const lines = [`教室: ${lesson.roomName}`]
  if (lesson.note) lines.push(`メモ: ${lesson.note}`)
  lines.push('', '（レッスンアプリから同期）')
  return lines.join('\n')
}

function buildEventBody(
  lesson: LessonSlot,
  names: { student?: string; accompanist?: string }
): EventBody {
  return {
    summary: buildSummary(lesson, names),
    description: buildDescription(lesson),
    start: {
      dateTime: buildDateTime(lesson.date, lesson.startTime),
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: buildDateTime(lesson.date, lesson.endTime),
      timeZone: 'Asia/Tokyo',
    },
    extendedProperties: {
      private: {
        lessonAppLessonId: lesson.id,
        lessonAppTeacherId: lesson.teacherId,
      },
    },
  }
}

export function lessonSyncFingerprint(
  lesson: LessonSlot,
  names: { student?: string; accompanist?: string }
): string {
  const body = buildEventBody(lesson, names)
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  /** 既存の Google 予定と紐づけただけ（追加・変更なし） */
  linked: number
  errors: string[]
}

export type SyncChunkResult = SyncResult & {
  complete: boolean
  nextOffset: number
  totalWork: number
  processed: number
  skippedUnchanged: number
  needsReconnect?: boolean
}

export type SyncChunkParams = {
  supabase: SupabaseClient
  oauth2: OAuth2Client
  authUid: string
  teacherId: string
  calendarId?: string
  offset?: number
  limit?: number
}

function buildSyncWorkList(
  lessons: LessonSlot[],
  mappings: Map<string, MappingRow>,
  nameById: Map<string, string>
): { work: SyncWorkItem[]; skippedUnchanged: number } {
  const currentIds = new Set(lessons.map((l) => l.id))
  const work: SyncWorkItem[] = []
  let skippedUnchanged = 0

  for (const [lessonId, map] of mappings.entries()) {
    if (!currentIds.has(lessonId)) {
      work.push({ kind: 'delete', lessonId, map })
    }
  }

  for (const lesson of lessons) {
    const names = {
      student: lesson.studentId ? nameById.get(lesson.studentId) : undefined,
      accompanist: lesson.accompanistId ? nameById.get(lesson.accompanistId) : undefined,
    }
    const fingerprint = lessonSyncFingerprint(lesson, names)
    const body = buildEventBody(lesson, names)
    const existing = mappings.get(lesson.id)

    if (existing) {
      if (existing.sync_fingerprint === fingerprint) {
        skippedUnchanged++
        continue
      }
      // アプリ側で内容が変わったときだけ Google を更新
      if (existing.sync_fingerprint != null && existing.sync_fingerprint !== fingerprint) {
        work.push({ kind: 'update', lesson, map: existing, fingerprint, body })
      } else {
        // 同期済みだが fingerprint 未記録 → Google は触らず DB だけ整える
        work.push({ kind: 'link', lesson, map: existing, fingerprint })
      }
    } else {
      work.push({ kind: 'insert', lesson, fingerprint, body })
    }
  }

  return { work, skippedUnchanged }
}

async function loadSyncContext(params: SyncChunkParams): Promise<
  | { error: string }
  | {
      targetCalendarId: string
      calApi: ReturnType<typeof google.calendar>
      work: SyncWorkItem[]
      skippedUnchanged: number
      authUid: string
      supabase: SupabaseClient
    }
> {
  const { supabase, oauth2, authUid, teacherId } = params
  const calendarId = params.calendarId ?? 'primary'

  const { data: tokenRow } = await supabase
    .from('teacher_google_calendar')
    .select('refresh_token, calendar_id')
    .eq('auth_uid', authUid)
    .maybeSingle()

  if (!tokenRow?.refresh_token) {
    return { error: 'Google カレンダーが未連携です' }
  }

  const targetCalendarId = tokenRow.calendar_id || calendarId

  const { data: lessonRows, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('teacher_id', teacherId)

  if (lessonsError) {
    return { error: lessonsError.message }
  }

  const lessons = normalizePendingToConfirmed(
    (lessonRows ?? []).map((r) => toLessonSlot(r as DbLesson))
  ).filter(shouldSyncLesson)

  let mapRows: MappingRow[] | null = null
  let mapErr: { message: string } | null = null
  {
    const res = await supabase
      .from('lesson_google_calendar_events')
      .select('lesson_id, google_event_id, calendar_id, sync_fingerprint')
      .eq('auth_uid', authUid)
    mapRows = res.data as MappingRow[] | null
    mapErr = res.error as { message: string } | null
  }
  if (mapErr && /sync_fingerprint|column/i.test(mapErr.message)) {
    const res = await supabase
      .from('lesson_google_calendar_events')
      .select('lesson_id, google_event_id, calendar_id')
      .eq('auth_uid', authUid)
    mapRows = res.data as MappingRow[] | null
    mapErr = res.error as { message: string } | null
  }

  if (mapErr) {
    return { error: mapErr.message }
  }

  const mappings = new Map<string, MappingRow>()
  for (const r of mapRows ?? []) {
    mappings.set(r.lesson_id, {
      lesson_id: r.lesson_id,
      google_event_id: r.google_event_id,
      calendar_id: r.calendar_id,
      sync_fingerprint: r.sync_fingerprint ?? null,
    })
  }

  const { data: usersRows } = await supabase.from('app_users').select('id, name')
  const nameById = new Map<string, string>()
  for (const u of usersRows ?? []) {
    nameById.set(u.id, u.name)
  }

  const { work, skippedUnchanged } = buildSyncWorkList(lessons, mappings, nameById)

  return {
    targetCalendarId,
    calApi: google.calendar({ version: 'v3', auth: oauth2 }),
    work,
    skippedUnchanged,
    authUid,
    supabase,
  }
}

async function saveLessonMapping(
  supabase: SupabaseClient,
  authUid: string,
  lessonId: string,
  googleEventId: string,
  calendarId: string,
  fingerprint: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('lesson_google_calendar_events').upsert(
    {
      auth_uid: authUid,
      lesson_id: lessonId,
      google_event_id: googleEventId,
      calendar_id: calendarId,
      sync_fingerprint: fingerprint,
    },
    { onConflict: 'auth_uid,lesson_id' }
  )
  return { error: error as unknown as Error | null }
}

/** Google カレンダー上に同じレッスン ID の予定があれば取得（再連携時の二重登録防止） */
async function findGoogleEventByLessonId(
  calApi: ReturnType<typeof google.calendar>,
  calendarId: string,
  lessonId: string
): Promise<{ eventId: string; calendarId: string } | null> {
  await paceGoogleCalendarApi()
  const res = await calApi.events.list({
    calendarId,
    privateExtendedProperty: [`lessonAppLessonId=${lessonId}`],
    maxResults: 10,
  })
  const item = (res.data.items ?? []).find(
    (e) => e.id && e.extendedProperties?.private?.lessonAppLessonId === lessonId
  )
  if (!item?.id) return null
  return { eventId: item.id, calendarId }
}

async function processWorkItem(
  item: SyncWorkItem,
  ctx: {
    calApi: ReturnType<typeof google.calendar>
    targetCalendarId: string
    authUid: string
    supabase: SupabaseClient
    abort: { reason: string | null }
  },
  result: SyncResult
): Promise<void> {
  if (ctx.abort.reason) return

  const { calApi, targetCalendarId, authUid, supabase, abort } = ctx

  const handleApiError = async (e: unknown, label: string, id: string) => {
    if (isInvalidGrantError(e)) {
      abort.reason = GOOGLE_CALENDAR_INVALID_GRANT_MESSAGE
      return
    }
    const msg = errorMessage(e)
    if (!/404|Not Found|deleted/i.test(msg)) {
      result.errors.push(`${label} ${id}: ${msg}`)
    }
  }

  if (item.kind === 'delete') {
    try {
      await paceGoogleCalendarApi()
      await calApi.events.delete({
        calendarId: item.map.calendar_id || targetCalendarId,
        eventId: item.map.google_event_id,
      })
      result.deleted++
    } catch (e: unknown) {
      await handleApiError(e, '削除', item.lessonId)
      if (abort.reason) return
    }
    if (!abort.reason) {
      await supabase
        .from('lesson_google_calendar_events')
        .delete()
        .eq('auth_uid', authUid)
        .eq('lesson_id', item.lessonId)
    }
    return
  }

  if (item.kind === 'link') {
    const { error: linkErr } = await saveLessonMapping(
      supabase,
      authUid,
      item.lesson.id,
      item.map.google_event_id,
      item.map.calendar_id || targetCalendarId,
      item.fingerprint
    )
    if (linkErr) {
      result.errors.push(`紐づけ ${item.lesson.id}: ${linkErr.message}`)
      return
    }
    result.linked++
    return
  }

  const { lesson, body, fingerprint } = item

  if (item.kind === 'update') {
    try {
      await paceGoogleCalendarApi()
      await calApi.events.patch({
        calendarId: item.map.calendar_id || targetCalendarId,
        eventId: item.map.google_event_id,
        requestBody: body,
      })
      result.updated++
      await saveLessonMapping(
        supabase,
        authUid,
        lesson.id,
        item.map.google_event_id,
        item.map.calendar_id || targetCalendarId,
        fingerprint
      )
    } catch (e: unknown) {
      await handleApiError(e, '更新', lesson.id)
    }
    return
  }

  // 新規扱いでも、Google 上に同じレッスン ID の予定があれば追加せず紐づけるだけ
  const existingOnGoogle = await findGoogleEventByLessonId(calApi, targetCalendarId, lesson.id)
  if (existingOnGoogle) {
    const { error: linkErr } = await saveLessonMapping(
      supabase,
      authUid,
      lesson.id,
      existingOnGoogle.eventId,
      existingOnGoogle.calendarId,
      fingerprint
    )
    if (linkErr) {
      result.errors.push(`紐づけ ${lesson.id}: ${linkErr.message}`)
      return
    }
    result.linked++
    return
  }

  try {
    await paceGoogleCalendarApi()
    const inserted = await calApi.events.insert({
      calendarId: targetCalendarId,
      requestBody: body,
    })
    const eventId = inserted.data.id
    if (!eventId) {
      result.errors.push(`作成失敗: ${lesson.id}`)
      return
    }
    const { error: insErr } = await saveLessonMapping(
      supabase,
      authUid,
      lesson.id,
      eventId,
      targetCalendarId,
      fingerprint
    )
    if (insErr) {
      result.errors.push(`DB保存 ${lesson.id}: ${insErr.message}`)
      try {
        await paceGoogleCalendarApi()
        await calApi.events.delete({ calendarId: targetCalendarId, eventId })
      } catch {
        /* ignore */
      }
      return
    }
    result.created++
  } catch (e: unknown) {
    await handleApiError(e, '作成', lesson.id)
  }
}

/** 1 チャンク分だけ同期（Vercel の実行時間制限を避ける） */
export async function syncLessonsToGoogleCalendarChunk(
  params: SyncChunkParams
): Promise<SyncChunkResult> {
  const offset = Math.max(0, params.offset ?? 0)
  const limit = Math.min(50, Math.max(1, params.limit ?? 25))

  const loaded = await loadSyncContext(params)
  if ('error' in loaded) {
    return {
      created: 0,
      updated: 0,
      deleted: 0,
      linked: 0,
      errors: [loaded.error],
      complete: true,
      nextOffset: 0,
      totalWork: 0,
      processed: 0,
      skippedUnchanged: 0,
    }
  }

  const { work, skippedUnchanged, calApi, targetCalendarId, authUid, supabase } = loaded

  if (offset === 0) {
    const authError = await verifyGoogleOAuthAccess(params.oauth2, supabase, authUid)
    if (authError) {
      return {
        created: 0,
        updated: 0,
        deleted: 0,
        linked: 0,
        errors: [authError],
        complete: true,
        nextOffset: 0,
        totalWork: work.length,
        processed: 0,
        skippedUnchanged,
        needsReconnect: authError === GOOGLE_CALENDAR_INVALID_GRANT_MESSAGE,
      }
    }
  }

  const slice = work.slice(offset, offset + limit)
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, linked: 0, errors: [] }
  const abort = { reason: null as string | null }

  for (const item of slice) {
    await processWorkItem(item, { calApi, targetCalendarId, authUid, supabase, abort }, result)
    if (abort.reason) break
  }

  if (abort.reason) {
    await clearStaleGoogleCalendarAuth(supabase, authUid)
    result.errors = [abort.reason]
    return {
      ...result,
      complete: true,
      nextOffset: work.length,
      totalWork: work.length,
      processed: work.length,
      skippedUnchanged,
      needsReconnect: true,
    }
  }

  const processed = Math.min(offset + limit, work.length)
  result.errors = dedupeCalendarErrors(result.errors)

  return {
    ...result,
    complete: processed >= work.length,
    nextOffset: processed,
    totalWork: work.length,
    processed,
    skippedUnchanged,
  }
}

/** 全チャンクをサーバー側で連続実行（API ルートからは使わない） */
export async function syncLessonsToGoogleCalendar(params: SyncChunkParams): Promise<SyncResult> {
  let offset = 0
  const total: SyncResult = { created: 0, updated: 0, deleted: 0, linked: 0, errors: [] }

  for (;;) {
    const chunk = await syncLessonsToGoogleCalendarChunk({ ...params, offset, limit: 25 })
    total.created += chunk.created
    total.updated += chunk.updated
    total.deleted += chunk.deleted
    total.linked += chunk.linked
    total.errors.push(...chunk.errors)
    if (chunk.complete) break
    offset = chunk.nextOffset
  }

  total.errors = dedupeCalendarErrors(total.errors)
  return total
}

export function createOAuth2ClientForUser(params: {
  clientId: string
  clientSecret: string
  redirectUri: string
  refreshToken: string
}): OAuth2Client {
  const o = new OAuth2Client(params.clientId, params.clientSecret, params.redirectUri)
  o.setCredentials({ refresh_token: params.refreshToken })
  return o
}
