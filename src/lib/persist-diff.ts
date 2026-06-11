/**
 * サーバー同期用の差分計算。
 * 毎回全 lessons を upsert せず、変更行だけ送る。
 */

import type {
  User,
  DaySettings,
  LessonSlot,
  WeeklyMaster,
  AccompanistAvailability,
} from '@/types'

export type SyncBaseline = {
  lessons: Map<string, string>
  daySettings: Map<string, string>
  users: Map<string, string>
  weeklyMastersHash: string
  accompanistAvailabilityIds: Set<string>
  accompanistAvailabilitiesHash: string
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value)
}

export function lessonRowHash(l: LessonSlot): string {
  return stableStringify({
    id: l.id,
    date: l.date,
    startTime: l.startTime,
    endTime: l.endTime,
    roomName: l.roomName,
    teacherId: l.teacherId,
    studentId: l.studentId ?? null,
    accompanistId: l.accompanistId ?? null,
    status: l.status,
    provisionalDeadline: l.provisionalDeadline ?? null,
    note: l.note ?? null,
  })
}

export function daySettingsHash(s: DaySettings): string {
  return stableStringify(s)
}

export function userRowHash(u: Pick<User, 'id' | 'name' | 'role'>): string {
  return stableStringify({ id: u.id, name: u.name, role: u.role })
}

export function weeklyMastersHash(rows: WeeklyMaster[]): string {
  const sorted = [...rows].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.slot_index - b.slot_index
  )
  return stableStringify(sorted)
}

export function accompanistAvailabilitiesHash(rows: AccompanistAvailability[]): string {
  const sorted = [...rows].sort(
    (a, b) => a.accompanistId.localeCompare(b.accompanistId) || a.slotId.localeCompare(b.slotId)
  )
  return stableStringify(sorted)
}

export function createBaselineFromState(input: {
  lessons: LessonSlot[]
  daySettings: DaySettings[]
  users: User[]
  weekly_masters: WeeklyMaster[]
  accompanistAvailabilities: AccompanistAvailability[]
}): SyncBaseline {
  const lessons = new Map<string, string>()
  for (const l of input.lessons) lessons.set(l.id, lessonRowHash(l))

  const daySettings = new Map<string, string>()
  for (const s of input.daySettings) daySettings.set(s.date, daySettingsHash(s))

  const users = new Map<string, string>()
  for (const u of input.users) users.set(u.id, userRowHash(u))

  return {
    lessons,
    daySettings,
    users,
    weeklyMastersHash: weeklyMastersHash(input.weekly_masters),
    accompanistAvailabilityIds: new Set(input.accompanistAvailabilities.map((a) => a.id)),
    accompanistAvailabilitiesHash: accompanistAvailabilitiesHash(input.accompanistAvailabilities),
  }
}

export function computeLessonDiff(
  current: LessonSlot[],
  baseline: Map<string, string>
): { upserts: LessonSlot[]; deletes: string[] } {
  const currentIds = new Set(current.map((l) => l.id))
  const upserts: LessonSlot[] = []
  for (const l of current) {
    if (baseline.get(l.id) !== lessonRowHash(l)) upserts.push(l)
  }
  const deletes: string[] = []
  for (const id of baseline.keys()) {
    if (!currentIds.has(id)) deletes.push(id)
  }
  return { upserts, deletes }
}

export function computeDaySettingsDiff(
  current: DaySettings[],
  baseline: Map<string, string>
): { upserts: DaySettings[] } {
  const upserts: DaySettings[] = []
  for (const s of current) {
    if (baseline.get(s.date) !== daySettingsHash(s)) upserts.push(s)
  }
  return { upserts }
}

export function computeUsersDiff(
  current: User[],
  baseline: Map<string, string>
): { upserts: User[]; deletes: string[] } {
  const currentIds = new Set(current.map((u) => u.id))
  const upserts: User[] = []
  for (const u of current) {
    if (baseline.get(u.id) !== userRowHash(u)) upserts.push(u)
  }
  const deletes: string[] = []
  for (const id of baseline.keys()) {
    if (!currentIds.has(id)) deletes.push(id)
  }
  return { upserts, deletes }
}

export type PersistDiffSummary = {
  lessonUpserts: number
  lessonDeletes: number
  daySettingUpserts: number
  userUpserts: number
  userDeletes: number
  weeklyMastersChanged: boolean
  accompanistAvailabilitiesChanged: boolean
}

export function summarizePersistDiff(
  state: {
    lessons: LessonSlot[]
    daySettings: DaySettings[]
    users: User[]
    weekly_masters: WeeklyMaster[]
    accompanistAvailabilities: AccompanistAvailability[]
  },
  baseline: SyncBaseline
): PersistDiffSummary {
  const lessonDiff = computeLessonDiff(state.lessons, baseline.lessons)
  const dayDiff = computeDaySettingsDiff(state.daySettings, baseline.daySettings)
  const userDiff = computeUsersDiff(state.users, baseline.users)
  return {
    lessonUpserts: lessonDiff.upserts.length,
    lessonDeletes: lessonDiff.deletes.length,
    daySettingUpserts: dayDiff.upserts.length,
    userUpserts: userDiff.upserts.length,
    userDeletes: userDiff.deletes.length,
    weeklyMastersChanged: weeklyMastersHash(state.weekly_masters) !== baseline.weeklyMastersHash,
    accompanistAvailabilitiesChanged:
      accompanistAvailabilitiesHash(state.accompanistAvailabilities) !==
      baseline.accompanistAvailabilitiesHash,
  }
}
