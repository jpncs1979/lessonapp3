import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LessonSlot } from '@/types'
import { normalizePendingToConfirmed } from '@/lib/utils'

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

type MappingRow = { lesson_id: string; google_event_id: string; calendar_id: string }

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

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  errors: string[]
}

export async function syncLessonsToGoogleCalendar(params: {
  supabase: SupabaseClient
  oauth2: OAuth2Client
  authUid: string
  teacherId: string
  calendarId?: string
}): Promise<SyncResult> {
  const { supabase, oauth2, authUid, teacherId } = params
  const calendarId = params.calendarId ?? 'primary'

  const { data: tokenRow } = await supabase
    .from('teacher_google_calendar')
    .select('refresh_token, calendar_id')
    .eq('auth_uid', authUid)
    .maybeSingle()

  if (!tokenRow?.refresh_token) {
    return { created: 0, updated: 0, deleted: 0, errors: ['Google カレンダーが未連携です'] }
  }

  const targetCalendarId = tokenRow.calendar_id || calendarId

  const { data: lessonRows, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('teacher_id', teacherId)

  if (lessonsError) {
    return { created: 0, updated: 0, deleted: 0, errors: [lessonsError.message] }
  }

  const lessons = normalizePendingToConfirmed(
    (lessonRows ?? []).map((r) => toLessonSlot(r as DbLesson))
  ).filter(shouldSyncLesson)

  const { data: mapRows, error: mapErr } = await supabase
    .from('lesson_google_calendar_events')
    .select('lesson_id, google_event_id, calendar_id')
    .eq('auth_uid', authUid)

  if (mapErr) {
    return { created: 0, updated: 0, deleted: 0, errors: [mapErr.message] }
  }

  const mappings = new Map<string, MappingRow>()
  for (const r of mapRows ?? []) {
    mappings.set(r.lesson_id, {
      lesson_id: r.lesson_id,
      google_event_id: r.google_event_id,
      calendar_id: r.calendar_id,
    })
  }

  const { data: usersRows } = await supabase.from('app_users').select('id, name')
  const nameById = new Map<string, string>()
  for (const u of usersRows ?? []) {
    nameById.set(u.id, u.name)
  }

  const calApi = google.calendar({ version: 'v3', auth: oauth2 })
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }

  const currentIds = new Set(lessons.map((l) => l.id))

  for (const [lessonId, map] of [...mappings.entries()]) {
    if (currentIds.has(lessonId)) continue
    try {
      await calApi.events.delete({
        calendarId: map.calendar_id || targetCalendarId,
        eventId: map.google_event_id,
      })
      result.deleted++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/404|Not Found|deleted/i.test(msg)) {
        result.errors.push(`削除 ${lessonId}: ${msg}`)
      }
    }
    await supabase
      .from('lesson_google_calendar_events')
      .delete()
      .eq('auth_uid', authUid)
      .eq('lesson_id', lessonId)
  }

  for (const lesson of lessons) {
    const names = {
      student: lesson.studentId ? nameById.get(lesson.studentId) : undefined,
      accompanist: lesson.accompanistId ? nameById.get(lesson.accompanistId) : undefined,
    }
    const body = {
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

    const existing = mappings.get(lesson.id)
    try {
      if (existing) {
        await calApi.events.patch({
          calendarId: existing.calendar_id || targetCalendarId,
          eventId: existing.google_event_id,
          requestBody: body,
        })
        result.updated++
      } else {
        const inserted = await calApi.events.insert({
          calendarId: targetCalendarId,
          requestBody: body,
        })
        const eventId = inserted.data.id
        if (!eventId) {
          result.errors.push(`作成失敗: ${lesson.id}`)
          continue
        }
        const { error: insErr } = await supabase.from('lesson_google_calendar_events').insert({
          auth_uid: authUid,
          lesson_id: lesson.id,
          google_event_id: eventId,
          calendar_id: targetCalendarId,
        })
        if (insErr) {
          result.errors.push(`DB保存 ${lesson.id}: ${insErr.message}`)
          try {
            await calApi.events.delete({ calendarId: targetCalendarId, eventId })
          } catch {
            /* ignore */
          }
          continue
        }
        mappings.set(lesson.id, {
          lesson_id: lesson.id,
          google_event_id: eventId,
          calendar_id: targetCalendarId,
        })
        result.created++
      }
    } catch (e: unknown) {
      result.errors.push(
        `${existing ? '更新' : '作成'} ${lesson.id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return result
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
