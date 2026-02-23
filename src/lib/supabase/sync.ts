/**
 * Supabase とのデータ同期・認証
 * テーブル名・カラム名は migrations の app_users, day_settings, lessons 等に合わせる
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '@/lib/store'
import type { User, DaySettings, LessonSlot, WeeklyMaster, AccompanistAvailability } from '@/types'

// DB の型（snake_case）
type DbAppUser = { id: string; name: string; role: string }
type DbDaySettings = {
  date: string
  end_time_mode: string
  lunch_break_open: boolean
  default_room: string
  provisional_hours: number
  start_time: string
  is_lesson_day: boolean
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
  provisional_deadline: string | null
  note: string | null
}
type DbWeeklyMaster = { day_of_week: number; slot_index: number; student_id: string }
type DbAvailability = { id: string; slot_id: string; accompanist_id: string; created_at: string }

export async function getAppUserFromSession(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>
): Promise<User | null> {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null
  const { data: row } = await supabase
    .from('auth_profiles')
    .select('app_user_id, email')
    .eq('auth_uid', authUser.id)
    .single()
  if (!row) return null
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, name, role')
    .eq('id', row.app_user_id)
    .single()
  if (!appUser) return null
  return {
    id: appUser.id,
    name: appUser.name,
    email: row.email ?? '',
    role: appUser.role as User['role'],
  }
}

/** 名簿のみ取得（未ログイン時用） */
export async function fetchAppUsers(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>
): Promise<AppState['users']> {
  const { data: rows } = await supabase.from('app_users').select('id, name, role').order('id')
  if (!rows?.length) return []
  return rows.map((r: DbAppUser) => ({
    id: r.id,
    name: r.name,
    email: '',
    role: r.role as User['role'],
  }))
}

/** ログイン済み時に全データを取得 */
export async function fetchFullState(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>
): Promise<Partial<AppState>> {
  const [usersRes, dayRes, lessonsRes, weeklyRes, availRes] = await Promise.all([
    supabase.from('app_users').select('id, name, role').order('id'),
    supabase.from('day_settings').select('*'),
    supabase.from('lessons').select('*'),
    supabase.from('weekly_masters').select('*'),
    supabase.from('accompanist_availabilities').select('*'),
  ])

  const users: AppState['users'] = (usersRes.data ?? []).map((r: DbAppUser) => ({
    id: r.id,
    name: r.name,
    email: '',
    role: r.role as User['role'],
  }))
  const students = users.filter((u) => u.role === 'student').map((u) => ({ id: u.id, name: u.name }))
  const accompanists = users.filter((u) => u.role === 'accompanist').map((u) => ({ id: u.id, name: u.name }))

  const daySettings: DaySettings[] = (dayRes.data ?? []).map((r: DbDaySettings) => ({
    date: r.date,
    endTimeMode: r.end_time_mode as DaySettings['endTimeMode'],
    lunchBreakOpen: r.lunch_break_open,
    defaultRoom: r.default_room,
    provisionalHours: r.provisional_hours as 24 | 48,
    startTime: r.start_time,
    isLessonDay: r.is_lesson_day,
  }))

  const lessons: LessonSlot[] = (lessonsRes.data ?? []).map((r: DbLesson) => ({
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    roomName: r.room_name,
    teacherId: r.teacher_id,
    studentId: r.student_id ?? undefined,
    accompanistId: r.accompanist_id ?? undefined,
    status: r.status as LessonSlot['status'],
    provisionalDeadline: r.provisional_deadline ?? undefined,
    note: r.note ?? undefined,
  }))

  const weekly_masters: WeeklyMaster[] = (weeklyRes.data ?? []).map((r: DbWeeklyMaster) => ({
    day_of_week: r.day_of_week,
    slot_index: r.slot_index,
    student_id: r.student_id,
  }))

  const accompanistAvailabilities: AccompanistAvailability[] = (availRes.data ?? []).map((r: DbAvailability) => ({
    id: r.id,
    slotId: r.slot_id,
    accompanistId: r.accompanist_id,
    createdAt: r.created_at,
  }))

  return {
    users,
    students,
    accompanists,
    daySettings,
    lessons,
    weekly_masters,
    accompanistAvailabilities,
  }
}

/** 登録済みか（auth_profiles に app_user_id があるか） */
export async function isAppUserRegistered(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>,
  appUserId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('auth_profiles')
    .select('app_user_id')
    .eq('app_user_id', appUserId)
    .maybeSingle()
  return !!data
}

/** サインアップ＋auth_profiles 登録 */
export async function registerWithSupabase(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>,
  appUserId: string,
  email: string,
  password: string
): Promise<{ error: Error | null }> {
  const { data: { user }, error: signUpError } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { app_user_id: appUserId } },
  })
  if (signUpError) return { error: signUpError as unknown as Error }
  if (!user) return { error: new Error('サインアップに失敗しました') }
  const { error: insertError } = await supabase.from('auth_profiles').insert({
    auth_uid: user.id,
    app_user_id: appUserId,
    email: email.trim(),
  })
  if (insertError) return { error: insertError as unknown as Error }
  return { error: null }
}

/** サインイン（メール・パスワード） */
export async function signInWithSupabase(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>,
  email: string,
  password: string
): Promise<{ user: User | null; error: Error | null }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (signInError) return { user: null, error: signInError as unknown as Error }
  const user = await getAppUserFromSession(supabase)
  return { user, error: null }
}

/** サインアウト */
export async function signOutSupabase(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>
): Promise<void> {
  await supabase.auth.signOut()
}

/** 状態を Supabase に保存 */
export async function persistState(
  supabase: NonNullable<ReturnType<typeof import('./client').createSupabaseClient>>,
  state: AppState
): Promise<{ error: Error | null }> {
  try {
    // app_users: 名簿は id で upsert
    for (const u of state.users) {
      const { error } = await supabase.from('app_users').upsert(
        { id: u.id, name: u.name, role: u.role },
        { onConflict: 'id' }
      )
      if (error) return { error: error as unknown as Error }
    }

    // day_settings: date で upsert
    for (const s of state.daySettings) {
      const { error } = await supabase.from('day_settings').upsert(
        {
          date: s.date,
          end_time_mode: s.endTimeMode,
          lunch_break_open: s.lunchBreakOpen,
          default_room: s.defaultRoom,
          provisional_hours: s.provisionalHours,
          start_time: s.startTime,
          is_lesson_day: s.isLessonDay,
        },
        { onConflict: 'date' }
      )
      if (error) return { error: error as unknown as Error }
    }

    // lessons: 既存を削除してから挿入
    const { data: existingLessons } = await supabase.from('lessons').select('id')
    if (existingLessons?.length) {
      const { error: delErr } = await supabase.from('lessons').delete().in('id', existingLessons.map((r) => r.id))
      if (delErr) return { error: delErr as unknown as Error }
    }
    if (state.lessons.length > 0) {
      const rows = state.lessons.map((l) => ({
        id: l.id,
        date: l.date,
        start_time: l.startTime,
        end_time: l.endTime,
        room_name: l.roomName,
        teacher_id: l.teacherId,
        student_id: l.studentId ?? null,
        accompanist_id: l.accompanistId ?? null,
        status: l.status,
        provisional_deadline: l.provisionalDeadline ?? null,
        note: l.note ?? null,
      }))
      const { error } = await supabase.from('lessons').insert(rows)
      if (error) return { error: error as unknown as Error }
    }

    // weekly_masters: 既存を削除して再挿入
    const { data: existingWM } = await supabase.from('weekly_masters').select('day_of_week, slot_index')
    if (existingWM?.length) {
      for (const r of existingWM) {
        await supabase.from('weekly_masters').delete().eq('day_of_week', r.day_of_week).eq('slot_index', r.slot_index)
      }
    }
    if (state.weekly_masters.length > 0) {
      const rows = state.weekly_masters.map((w) => ({
        day_of_week: w.day_of_week,
        slot_index: w.slot_index,
        student_id: w.student_id,
      }))
      const { error } = await supabase.from('weekly_masters').insert(rows)
      if (error) return { error: error as unknown as Error }
    }

    // accompanist_availabilities: 既存を削除して再挿入
    const { data: existingAv } = await supabase.from('accompanist_availabilities').select('id')
    if (existingAv?.length) {
      const { error: delErr } = await supabase.from('accompanist_availabilities').delete().in('id', existingAv.map((r) => r.id))
      if (delErr) return { error: delErr as unknown as Error }
    }
    if (state.accompanistAvailabilities.length > 0) {
      const rows = state.accompanistAvailabilities.map((a) => ({
        id: a.id,
        slot_id: a.slotId,
        accompanist_id: a.accompanistId,
        created_at: a.createdAt,
      }))
      const { error } = await supabase.from('accompanist_availabilities').insert(rows)
      if (error) return { error: error as unknown as Error }
    }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) }
  }
}
