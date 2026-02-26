'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode, useRef } from 'react'
import {
  User, LessonSlot, DaySettings, AccompanistAvailability,
  LessonStatus, EndTimeMode, Student, Accompanist, WeeklyMaster
} from '@/types'
import { generateId, calcProvisionalDeadline } from '@/lib/utils'
import { today, formatDateToYYYYMMDD } from '@/lib/schedule'
import { createSupabaseClient } from '@/lib/supabase/client'
import {
  getAppUserFromSession,
  getAppUserByAuthUid,
  fetchAppUsers,
  fetchFullState,
  persistState,
  signOutSupabase,
} from '@/lib/supabase/sync'

// ─── デモ用初期データ ───────────────────────────────────────────────

const TEACHER: User = { id: 'teacher-1', name: '大和田 智彦', email: 'owada@music.ac.jp', role: 'teacher' }

function makeInitialStudents(): Student[] {
  return [
    { id: 'student-1', name: '田中 花子' },
    { id: 'student-2', name: '鈴木 太郎' },
    { id: 'student-3', name: '山田 美咲' },
    { id: 'student-4', name: '伊藤 健一' },
    { id: 'student-5', name: '渡辺 由里子' },
  ]
}

function makeInitialAccompanists(): Accompanist[] {
  return [
    { id: 'accompanist-1', name: '中村 雅子' },
    { id: 'accompanist-2', name: '小林 健太' },
  ]
}

function studentsAndAccompanistsToUsers(students: Student[], accompanists: Accompanist[]): User[] {
  return [
    TEACHER,
    ...students.map((s) => ({ id: s.id, name: s.name, email: '', role: 'student' as const })),
    ...accompanists.map((a) => ({ id: a.id, name: a.name, email: '', role: 'accompanist' as const })),
  ]
}

const DEMO_USERS: User[] = studentsAndAccompanistsToUsers(makeInitialStudents(), makeInitialAccompanists())

function makeDefaultDaySettings(date: string): DaySettings {
  return {
    date,
    endTimeMode: '20:00',
    lunchBreakOpen: false,
    defaultRoom: '1号館120',
    provisionalHours: 24,
    startTime: '09:00',
    isLessonDay: false,
  }
}

function generateDemoSettings(baseDate: string): DaySettings[] {
  const settings: DaySettings[] = []
  const [by, bm, bd] = baseDate.split('-').map(Number)
  const base = new Date(by, bm - 1, bd)
  for (let i = -7; i <= 30; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const dateStr = formatDateToYYYYMMDD(d)
    const day = d.getDay() // 0=日, 6=土
    if (day === 0) continue // 日曜は除外
    // デフォルトはレッスン日も公開しない。デモ用に今日・明日のみレッスン日ON
    const isDemoLessonDay = i >= 0 && i <= 1
    settings.push({
      ...makeDefaultDaySettings(dateStr),
      endTimeMode: '20:00',
      lunchBreakOpen: i % 5 === 0,
      isLessonDay: isDemoLessonDay,
    })
  }
  return settings
}

function generateDemoSlots(settings: DaySettings[], today: string): LessonSlot[] {
  const slots: LessonSlot[] = []

  // 今日のデモデータ
  const todaySettings = settings.find((s) => s.date === today)
  if (todaySettings) {
    const times = ['09:00', '09:45', '10:40', '11:25', '13:00', '13:45']
    const studentIds = ['student-1', 'student-2', null, 'student-3', null, null]
    const accompanistIds = ['accompanist-1', null, null, 'accompanist-2', null, null]
    const statuses: LessonStatus[] = ['confirmed', 'confirmed', 'available', 'confirmed', 'available', 'available']

    times.forEach((startTime, i) => {
      const [h, m] = startTime.split(':').map(Number)
      const endMinutes = h * 60 + m + 45
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

      slots.push({
        id: `${today}-${startTime.replace(':', '')}`,
        date: today,
        startTime,
        endTime,
        roomName: todaySettings.defaultRoom,
        teacherId: 'teacher-1',
        studentId: studentIds[i] || undefined,
        accompanistId: accompanistIds[i] || undefined,
        status: statuses[i],
      })
    })
  }

  // 明日のデモデータ
  const [ty, tm, td] = today.split('-').map(Number)
  const tomorrow = new Date(ty, tm - 1, td)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = formatDateToYYYYMMDD(tomorrow)
  const tmSettings = settings.find((s) => s.date === tomorrowStr)
  if (tmSettings) {
    const times = ['09:00', '09:45', '10:40']
    const statuses: LessonStatus[] = ['pending', 'available', 'available']
    const studentIds = ['student-4', null, null]

    times.forEach((startTime, i) => {
      const [h, m] = startTime.split(':').map(Number)
      const endMinutes = h * 60 + m + 45
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`

      slots.push({
        id: `${tomorrowStr}-${startTime.replace(':', '')}`,
        date: tomorrowStr,
        startTime,
        endTime,
        roomName: tmSettings.defaultRoom,
        teacherId: 'teacher-1',
        studentId: studentIds[i] || undefined,
        status: statuses[i],
        provisionalDeadline: i === 0 ? calcProvisionalDeadline(24) : undefined,
      })
    })
  }

  return slots
}

// ─── State & Actions ───────────────────────────────────────────────

export interface AppState {
  currentUser: User | null
  sessionRestoreDone: boolean
  users: User[]
  students: Student[]
  accompanists: Accompanist[]
  weekly_masters: WeeklyMaster[]
  daySettings: DaySettings[]
  lessons: LessonSlot[]
  accompanistAvailabilities: AccompanistAvailability[]
}

type Action =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_LESSON'; payload: LessonSlot }
  | { type: 'UPDATE_LESSON'; payload: Partial<LessonSlot> & { id: string } }
  | { type: 'DELETE_LESSON'; payload: string }
  | { type: 'UPSERT_DAY_SETTINGS'; payload: DaySettings }
  | { type: 'ADD_AVAILABILITY'; payload: AccompanistAvailability }
  | { type: 'REMOVE_AVAILABILITY'; payload: { slotId: string; accompanistId: string } }
  | { type: 'APPROVE_LESSON'; payload: string }
  | { type: 'CONFIRM_ACCOMPANIED'; payload: { slotId: string } }
  | { type: 'EXPIRE_PROVISIONAL' }
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'MERGE_REMOTE_STATE'; payload: Partial<Pick<AppState, 'users' | 'students' | 'accompanists' | 'daySettings' | 'lessons' | 'weekly_masters' | 'accompanistAvailabilities'>> }
  | { type: 'ADD_STUDENT'; payload: Student }
  | { type: 'UPDATE_STUDENT'; payload: { id: string; name: string } }
  | { type: 'DELETE_STUDENT'; payload: string }
  | { type: 'ADD_ACCOMPANIST'; payload: Accompanist }
  | { type: 'UPDATE_ACCOMPANIST'; payload: { id: string; name: string } }
  | { type: 'DELETE_ACCOMPANIST'; payload: string }
  | { type: 'UPSERT_WEEKLY_MASTER'; payload: WeeklyMaster }
  | { type: 'REMOVE_WEEKLY_MASTER'; payload: { day_of_week: number; slot_index: number } }
  | { type: 'REPLACE_WEEKLY_MASTERS'; payload: WeeklyMaster[] }
  | { type: 'UPDATE_USER_EMAIL'; payload: { id: string; email: string } }
  | { type: 'SESSION_RESTORE_DONE' }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, currentUser: action.payload }
    case 'LOGOUT':
      return { ...state, currentUser: null }
    case 'SESSION_RESTORE_DONE':
      return { ...state, sessionRestoreDone: true }

    case 'ADD_LESSON':
      return { ...state, lessons: [...state.lessons, action.payload] }

    case 'UPDATE_LESSON':
      return {
        ...state,
        lessons: state.lessons.map((l) =>
          l.id === action.payload.id ? { ...l, ...action.payload } : l
        ),
      }

    case 'DELETE_LESSON':
      return { ...state, lessons: state.lessons.filter((l) => l.id !== action.payload) }

    case 'UPSERT_DAY_SETTINGS':
      return {
        ...state,
        daySettings: [
          ...state.daySettings.filter((s) => s.date !== action.payload.date),
          action.payload,
        ],
      }

    case 'ADD_AVAILABILITY':
      return {
        ...state,
        accompanistAvailabilities: [...state.accompanistAvailabilities, action.payload],
      }

    case 'REMOVE_AVAILABILITY':
      return {
        ...state,
        accompanistAvailabilities: state.accompanistAvailabilities.filter(
          (a) => !(a.slotId === action.payload.slotId && a.accompanistId === action.payload.accompanistId)
        ),
      }

    // 先生が承認
    case 'APPROVE_LESSON':
      return {
        ...state,
        lessons: state.lessons.map((l) =>
          l.id === action.payload ? { ...l, status: 'confirmed' } : l
        ),
      }

    // 伴奏つきレッスン確定 → 同伴奏者の同時間の他availabilityを削除
    case 'CONFIRM_ACCOMPANIED': {
      const targetLesson = state.lessons.find((l) => l.id === action.payload.slotId)
      if (!targetLesson?.accompanistId) return state

      const accompanistId = targetLesson.accompanistId
      // 同伴奏者の確定したスロットと時間が被る他のavailabilityを削除
      const conflictSlotIds = state.accompanistAvailabilities
        .filter((a) => a.accompanistId === accompanistId && a.slotId !== action.payload.slotId)
        .filter((a) => {
          const conflictSlot = state.lessons.find((l) => l.id === a.slotId)
          if (!conflictSlot) return false
          // 同日・重複時間チェック
          return (
            conflictSlot.date === targetLesson.date &&
            conflictSlot.startTime === targetLesson.startTime
          )
        })
        .map((a) => a.slotId)

      return {
        ...state,
        accompanistAvailabilities: state.accompanistAvailabilities.filter(
          (a) => !conflictSlotIds.includes(a.slotId)
        ),
      }
    }

    // 期限切れの仮予約を自動解放
    case 'EXPIRE_PROVISIONAL':
      return {
        ...state,
        lessons: state.lessons.map((l) => {
          if (
            l.status === 'pending' &&
            l.provisionalDeadline &&
            new Date(l.provisionalDeadline) < new Date()
          ) {
            return { ...l, status: 'available', studentId: undefined, accompanistId: undefined, provisionalDeadline: undefined }
          }
          return l
        }),
      }

    case 'LOAD_STATE':
      return { ...action.payload, sessionRestoreDone: action.payload.sessionRestoreDone ?? state.sessionRestoreDone }

    case 'MERGE_REMOTE_STATE': {
      const p = action.payload
      return {
        ...state,
        ...(p.users != null && { users: p.users }),
        ...(p.students != null && { students: p.students }),
        ...(p.accompanists != null && { accompanists: p.accompanists }),
        ...(p.daySettings != null && { daySettings: p.daySettings }),
        ...(p.lessons != null && { lessons: p.lessons }),
        ...(p.weekly_masters != null && { weekly_masters: p.weekly_masters }),
        ...(p.accompanistAvailabilities != null && { accompanistAvailabilities: p.accompanistAvailabilities }),
      }
    }

    case 'ADD_STUDENT': {
      const next = [...state.students, action.payload]
      const users = [
        ...state.users.filter((u) => u.role !== 'student'),
        ...next.map((s) => ({ id: s.id, name: s.name, email: '', role: 'student' as const })),
      ]
      return { ...state, students: next, users }
    }
    case 'UPDATE_STUDENT': {
      const next = state.students.map((s) =>
        s.id === action.payload.id ? { ...s, name: action.payload.name } : s
      )
      const users = state.users.map((u) =>
        u.id === action.payload.id ? { ...u, name: action.payload.name } : u
      )
      return { ...state, students: next, users }
    }
    case 'DELETE_STUDENT': {
      const next = state.students.filter((s) => s.id !== action.payload)
      const users = state.users.filter((u) => u.id !== action.payload)
      return { ...state, students: next, users }
    }
    case 'ADD_ACCOMPANIST': {
      const next = [...state.accompanists, action.payload]
      const users = [
        ...state.users.filter((u) => u.role !== 'accompanist'),
        ...next.map((a) => ({ id: a.id, name: a.name, email: '', role: 'accompanist' as const })),
      ]
      return { ...state, accompanists: next, users }
    }
    case 'UPDATE_ACCOMPANIST': {
      const next = state.accompanists.map((a) =>
        a.id === action.payload.id ? { ...a, name: action.payload.name } : a
      )
      const users = state.users.map((u) =>
        u.id === action.payload.id ? { ...u, name: action.payload.name } : u
      )
      return { ...state, accompanists: next, users }
    }
    case 'DELETE_ACCOMPANIST': {
      const next = state.accompanists.filter((a) => a.id !== action.payload)
      const users = state.users.filter((u) => u.id !== action.payload)
      return { ...state, accompanists: next, users }
    }
    case 'UPSERT_WEEKLY_MASTER': {
      const rest = state.weekly_masters.filter(
        (w) => !(w.day_of_week === action.payload.day_of_week && w.slot_index === action.payload.slot_index)
      )
      return { ...state, weekly_masters: [...rest, action.payload] }
    }
    case 'REMOVE_WEEKLY_MASTER': {
      const next = state.weekly_masters.filter(
        (w) => !(w.day_of_week === action.payload.day_of_week && w.slot_index === action.payload.slot_index)
      )
      return { ...state, weekly_masters: next }
    }
    case 'REPLACE_WEEKLY_MASTERS':
      return { ...state, weekly_masters: action.payload }

    case 'UPDATE_USER_EMAIL': {
      const next = state.users.map((u) =>
        u.id === action.payload.id ? { ...u, email: action.payload.email } : u
      )
      return { ...state, users: next }
    }

    default:
      return state
  }
}

// ─── Context ───────────────────────────────────────────────────────

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<Action>
  getUserById: (id?: string) => User | undefined
  getDaySettings: (date: string) => DaySettings
  getLessonsForDate: (date: string) => LessonSlot[]
  getAvailabilitiesForSlot: (slotId: string) => AccompanistAvailability[]
  getAvailabilitiesForAccompanist: (accompanistId: string) => AccompanistAvailability[]
  /** サーバーから最新の日設定・レッスン等を再取得（生徒・伴奏者向け） */
  refreshFromServer: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

const STORAGE_KEY = 'lessonapp_state'
/** 生徒・伴奏者が「名前だけで入った」ときの永続化キー（先生は使わない） */
export const NAME_ONLY_USER_KEY = 'lessonapp_name_only_user'

export function AppProvider({ children }: { children: ReactNode }) {
  const todayStr = today()
  const demoSettings = generateDemoSettings(todayStr)
  const demoSlots = generateDemoSlots(demoSettings, todayStr)

  const initialStudents = makeInitialStudents()
  const initialAccompanists = makeInitialAccompanists()
  const initialState: AppState = {
    currentUser: null,
    sessionRestoreDone: false,
    users: studentsAndAccompanistsToUsers(initialStudents, initialAccompanists),
    students: initialStudents,
    accompanists: initialAccompanists,
    weekly_masters: [],
    daySettings: demoSettings,
    lessons: demoSlots,
    accompanistAvailabilities: [
      { id: 'av-1', slotId: `${todayStr}-0900`, accompanistId: 'accompanist-1', createdAt: new Date().toISOString() },
      {
        id: 'av-2',
        slotId: (() => {
          const [y, m, d] = todayStr.split('-').map(Number)
          const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + 1)
          return formatDateToYYYYMMDD(dt) + '-0945'
        })(),
        accompanistId: 'accompanist-2',
        createdAt: new Date().toISOString()
      },
    ],
  }

  function migrateLoadedState(loaded: AppState): AppState {
    let students = loaded.students
    let accompanists = loaded.accompanists
    let users = loaded.users
    if (!students?.length && loaded.users?.length) {
      students = loaded.users.filter((u) => u.role === 'student').map((u) => ({ id: u.id, name: u.name }))
    }
    if (!accompanists?.length && loaded.users?.length) {
      accompanists = loaded.users.filter((u) => u.role === 'accompanist').map((u) => ({ id: u.id, name: u.name }))
    }
    if (!users?.length && (students?.length || accompanists?.length)) {
      users = [
        ...loaded.users.filter((u) => u.role === 'teacher'),
        ...(students || []).map((s) => ({ id: s.id, name: s.name, email: '', role: 'student' as const })),
        ...(accompanists || []).map((a) => ({ id: a.id, name: a.name, email: '', role: 'accompanist' as const })),
      ]
    }
    return {
      ...loaded,
      students: students || [],
      accompanists: accompanists || [],
      weekly_masters: loaded.weekly_masters ?? [],
      users: users || loaded.users,
    }
  }

  const [state, dispatch] = useReducer(reducer, initialState)
  const hasRestoredRef = React.useRef(false)
  const skipPersistRef = useRef(false)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabaseRef = useRef(createSupabaseClient())

  // Supabase 利用時: セッション復元と名簿/データ取得（エラー・ハング時も必ず SESSION_RESTORE_DONE する）
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) {
      hasRestoredRef.current = true
      dispatch({ type: 'SESSION_RESTORE_DONE' })
      return
    }
    let mounted = true
    const done = () => {
      if (!mounted) return
      hasRestoredRef.current = true
      dispatch({ type: 'SESSION_RESTORE_DONE' })
    }
    const timeoutId = setTimeout(done, 5000)
    const SESSION_LOCK_TIMEOUT_MS = 8000
    ;(async () => {
      try {
        await new Promise((r) => setTimeout(r, 400))
        if (!mounted) return
        const appUser = await Promise.race([
          getAppUserFromSession(supabase),
          new Promise<User | null>((r) => setTimeout(() => r(null), SESSION_LOCK_TIMEOUT_MS)),
        ]).catch(() => null)
        if (!mounted) return
        if (appUser) {
          try { localStorage.removeItem(NAME_ONLY_USER_KEY) } catch { /* ignore */ }
          dispatch({ type: 'LOGIN', payload: appUser })
          skipPersistRef.current = true
          const full = await fetchFullState(supabase)
          if (mounted && full) dispatch({ type: 'MERGE_REMOTE_STATE', payload: full })
        } else {
          try {
            const raw = localStorage.getItem(NAME_ONLY_USER_KEY)
            if (raw && mounted) {
              const parsed = JSON.parse(raw) as { id: string; name: string; role: string }
              if (parsed?.id && parsed?.name && (parsed.role === 'student' || parsed.role === 'accompanist')) {
                const nameOnlyUser: User = { id: parsed.id, name: parsed.name, email: '', role: parsed.role as User['role'] }
                dispatch({ type: 'LOGIN', payload: nameOnlyUser })
                skipPersistRef.current = true
                const full = await fetchFullState(supabase)
                if (mounted && full) dispatch({ type: 'MERGE_REMOTE_STATE', payload: full })
                clearTimeout(timeoutId)
                done()
                return
              }
            }
          } catch { /* ignore */ }
          const users = await fetchAppUsers(supabase)
          if (mounted && users.length) {
            const students = users.filter((u) => u.role === 'student').map((u) => ({ id: u.id, name: u.name }))
            const accompanists = users.filter((u) => u.role === 'accompanist').map((u) => ({ id: u.id, name: u.name }))
            dispatch({ type: 'MERGE_REMOTE_STATE', payload: { users, students, accompanists } })
          }
        }
      } catch {
        /* ネットワークエラー等でも必ず完了させる */
      } finally {
        clearTimeout(timeoutId)
        done()
      }
    })()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted || !supabase) return
      if (event === 'SIGNED_OUT') {
        try { localStorage.removeItem(NAME_ONLY_USER_KEY) } catch { /* ignore */ }
        dispatch({ type: 'LOGOUT' })
        return
      }
      if (event === 'SIGNED_IN' && session?.user) {
        const appUser = await getAppUserByAuthUid(supabase, session.user.id)
        if (appUser) {
          dispatch({ type: 'LOGIN', payload: appUser })
          skipPersistRef.current = true
          const full = await fetchFullState(supabase)
          if (mounted && full) dispatch({ type: 'MERGE_REMOTE_STATE', payload: full })
        }
      }
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // クライアントでマウント後に localStorage から復元（Supabase 未使用時）
  useEffect(() => {
    if (supabaseRef.current) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const loaded = migrateLoadedState(JSON.parse(stored))
        dispatch({ type: 'LOAD_STATE', payload: loaded })
      }
    } catch { /* ignore */ }
    hasRestoredRef.current = true
    dispatch({ type: 'SESSION_RESTORE_DONE' })
  }, [])

  // LocalStorage に保存（Supabase 未使用時）
  useEffect(() => {
    if (supabaseRef.current || !hasRestoredRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* ignore */ }
  }, [state])

  // ログアウト時に名前のみユーザーを localStorage から削除
  useEffect(() => {
    if (state.currentUser === null) {
      try { localStorage.removeItem(NAME_ONLY_USER_KEY) } catch { /* ignore */ }
    }
  }, [state.currentUser])

  // Supabase 利用時: 状態変更をデバウンスして保存（先生のみ・セッションがあるときだけ）
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase || !state.currentUser || !hasRestoredRef.current) return
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current)
    persistTimeoutRef.current = setTimeout(async () => {
      persistTimeoutRef.current = null
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await persistState(supabase, state)
    }, 1500)
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current)
    }
  }, [state])

  // 定期的に期限切れをチェック（1分ごと）
  useEffect(() => {
    dispatch({ type: 'EXPIRE_PROVISIONAL' })
    const interval = setInterval(() => {
      dispatch({ type: 'EXPIRE_PROVISIONAL' })
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const getUserById = (id?: string) => state.users.find((u) => u.id === id)

  const refreshFromServer = useCallback(async () => {
    const supabase = supabaseRef.current
    if (!supabase) return
    const full = await fetchFullState(supabase)
    if (full) dispatch({ type: 'MERGE_REMOTE_STATE', payload: full })
  }, [])

  // 生徒・伴奏者は定期的にサーバーから再取得（先生の設定・レッスン反映のため）
  useEffect(() => {
    const isNameOnly = state.currentUser && (state.currentUser.role === 'student' || state.currentUser.role === 'accompanist')
    if (!isNameOnly) return
    const intervalMs = 2 * 60 * 1000
    const id = setInterval(refreshFromServer, intervalMs)
    return () => clearInterval(id)
  }, [state.currentUser?.id, state.currentUser?.role, refreshFromServer])

  const getDaySettings = (date: string): DaySettings => {
    return (
      state.daySettings.find((s) => s.date === date) ||
      makeDefaultDaySettings(date)
    )
  }

  const getLessonsForDate = (date: string) =>
    state.lessons.filter((l) => l.date === date)

  const getAvailabilitiesForSlot = (slotId: string) =>
    state.accompanistAvailabilities.filter((a) => a.slotId === slotId)

  const getAvailabilitiesForAccompanist = (accompanistId: string) =>
    state.accompanistAvailabilities.filter((a) => a.accompanistId === accompanistId)

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        getUserById,
        getDaySettings,
        getLessonsForDate,
        getAvailabilitiesForSlot,
        getAvailabilitiesForAccompanist,
        refreshFromServer,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { DEMO_USERS, makeDefaultDaySettings }
