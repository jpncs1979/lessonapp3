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

function dedupeCalendarErrors(errors: string[]): string[] {
  if (!errors.length) return errors
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
type SyncWorkItem = SyncWorkDelete | SyncWorkInsert | SyncWorkUpdate

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
  errors: string[]
}

export type SyncChunkResult = SyncResult & {
  complete: boolean
  nextOffset: number
  totalWork: number
  processed: number
  skippedUnchanged: number
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
      work.push({ kind: 'update', lesson, map: existing, fingerprint, body })
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

async function processWorkItem(
  item: SyncWorkItem,
  ctx: {
    calApi: ReturnType<typeof google.calendar>
    targetCalendarId: string
    authUid: string
    supabase: SupabaseClient
  },
  result: SyncResult
): Promise<void> {
  const { calApi, targetCalendarId, authUid, supabase } = ctx

  if (item.kind === 'delete') {
    try {
      await paceGoogleCalendarApi()
      await calApi.events.delete({
        calendarId: item.map.calendar_id || targetCalendarId,
        eventId: item.map.google_event_id,
      })
      result.deleted++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/404|Not Found|deleted/i.test(msg)) {
        result.errors.push(`削除 ${item.lessonId}: ${msg}`)
      }
    }
    await supabase
      .from('lesson_google_calendar_events')
      .delete()
      .eq('auth_uid', authUid)
      .eq('lesson_id', item.lessonId)
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
      await supabase
        .from('lesson_google_calendar_events')
        .update({ sync_fingerprint: fingerprint } as Record<string, string>)
        .eq('auth_uid', authUid)
        .eq('lesson_id', lesson.id)
    } catch (e: unknown) {
      result.errors.push(
        `更新 ${lesson.id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
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
    const { error: insErr } = await supabase.from('lesson_google_calendar_events').upsert(
      {
        auth_uid: authUid,
        lesson_id: lesson.id,
        google_event_id: eventId,
        calendar_id: targetCalendarId,
        sync_fingerprint: fingerprint,
      },
      { onConflict: 'auth_uid,lesson_id' }
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
    result.errors.push(
      `作成 ${lesson.id}: ${e instanceof Error ? e.message : String(e)}`
    )
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
      errors: [loaded.error],
      complete: true,
      nextOffset: 0,
      totalWork: 0,
      processed: 0,
      skippedUnchanged: 0,
    }
  }

  const { work, skippedUnchanged, calApi, targetCalendarId, authUid, supabase } = loaded
  const slice = work.slice(offset, offset + limit)
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }

  for (const item of slice) {
    await processWorkItem(item, { calApi, targetCalendarId, authUid, supabase }, result)
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
  const total: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }

  for (;;) {
    const chunk = await syncLessonsToGoogleCalendarChunk({ ...params, offset, limit: 25 })
    total.created += chunk.created
    total.updated += chunk.updated
    total.deleted += chunk.deleted
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
