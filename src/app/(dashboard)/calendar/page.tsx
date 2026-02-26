'use client'

import { useApp } from '@/lib/store'
import { getTeacherGroupLabel } from '@/lib/utils'
import MonthCalendar from '@/components/calendar/MonthCalendar'

export default function CalendarPage() {
  const { state } = useApp()
  const { currentUser } = state

  if (!currentUser) return null

  const isTeacher = currentUser.role === 'teacher'
  const isStudent = currentUser.role === 'student'
  const isAccompanist = currentUser.role === 'accompanist'

  const title =
    isTeacher ? `${getTeacherGroupLabel(currentUser.name)} レッスン実施スケジュール`
    : isAccompanist ? `${currentUser.name}さん 伴奏付きレッスン一覧`
    : `${currentUser.name}さんの予約状況`

  const description =
    isTeacher
      ? '門下生全体の予約状況（個人/伴奏付き）の把握、各学生の受講回数、予約の最終承認'
      : isAccompanist
        ? '可能枠の設定、担当する伴奏付きレッスンの確定状況、自分が「可能」と提示している枠の確認'
        : 'レッスン可の枠の確認、自分の予約済みレッスン、個人レッスンまたは伴奏付きレッスンの予約'

  return (
    <div className="min-h-0 flex flex-col pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-base sm:text-xl font-bold text-gray-900 mb-0.5 sm:mb-1 truncate">{title}</h1>
      <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3 line-clamp-2 sm:line-clamp-none">{description}</p>
      <p className="text-xs text-gray-400 mb-2 sm:mb-4 hidden sm:block">
        日付をタップすると、その日のスケジュール（時間割）に移動します。
      </p>

      <div className="min-h-0 flex-1 flex flex-col">
        <MonthCalendar />
      </div>
    </div>
  )
}
