export type UserRole = 'teacher' | 'student' | 'accompanist'

export type LessonStatus =
  | 'available'    // 先生が公開したレッスン可枠
  | 'pending'      // 生徒が仮予約（承認待ち）
  | 'confirmed'    // 先生が承認済み
  | 'break'        // 休憩
  | 'lunch'        // 昼休み
  | 'blocked'      // 先生がブロック

export type EndTimeMode = '16:30' | '20:00'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  department?: string
  avatarInitials?: string
}

export interface DaySettings {
  date: string          // YYYY-MM-DD
  endTimeMode: EndTimeMode
  lunchBreakOpen: boolean  // true=レッスン枠として開放
  defaultRoom: string
  provisionalHours: 24 | 48
  startTime: string     // HH:MM (default '09:00')
  isLessonDay: boolean  // false=レッスンなし
}

export interface LessonSlot {
  id: string
  date: string          // YYYY-MM-DD
  startTime: string     // HH:MM
  endTime: string       // HH:MM
  roomName: string
  teacherId: string
  studentId?: string
  accompanistId?: string
  status: LessonStatus
  provisionalDeadline?: string  // ISO datetime
  note?: string
  isLunchSlot?: boolean
}

export interface AccompanistAvailability {
  id: string
  slotId: string
  accompanistId: string
  createdAt: string
}

export interface TimeItem {
  type: 'slot' | 'break' | 'lunch'
  startTime: string
  endTime: string
  slot?: LessonSlot
  slotIndex?: number  // 何コマ目か
}

export interface MonthSummary {
  date: string
  totalSlots: number
  availableSlots: number
  confirmedSlots: number
  isLessonDay: boolean
}

/** 学生名簿：氏名のみ */
export interface Student {
  id: string
  name: string
}

/** 伴奏者名簿：氏名のみ */
export interface Accompanist {
  id: string
  name: string
}

/** 週間マスター：曜日・スロット番号・受講生。個人/伴奏付きはここでは設定しない */
export interface WeeklyMaster {
  day_of_week: number  // 0=日, 1=月, ..., 6=土
  slot_index: number    // 09:00開始の45分1コマの番号（0=09:00-, 1=09:45-, ...）
  student_id: string
}
