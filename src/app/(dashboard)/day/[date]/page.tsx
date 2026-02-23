'use client'

import { use } from 'react'
import DayTimetable from '@/components/timetable/DayTimetable'
import EndTimeSwitcher from '@/components/timetable/EndTimeSwitcher'
import { useApp } from '@/lib/store'
import { getTeacherGroupLabel } from '@/lib/utils'
import { generateTimeItems } from '@/lib/schedule'
import { EndTimeMode } from '@/types'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'

/** 日付を「〇月〇日」に（ローカル解釈） */
function formatDayTitle(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const { state, dispatch, getDaySettings, getLessonsForDate, getUserById } = useApp()
  const { currentUser, lessons, users } = state
  const settings = getDaySettings(date)
  const isTeacher = currentUser?.role === 'teacher'

  const teacher = users.find((u) => u.role === 'teacher')
  const scheduleTitle = teacher
    ? `${getTeacherGroupLabel(teacher.name)} レッスンスケジュール（${formatDayTitle(date)}）`
    : `レッスンスケジュール（${formatDayTitle(date)}）`

  const lessonsForDate = getLessonsForDate(date)
  const confirmedOrPending = lessonsForDate.filter((l) => l.status === 'confirmed' || l.status === 'pending')
  const todayCountByStudent = confirmedOrPending.reduce<Record<string, number>>((acc, l) => {
    if (l.studentId) {
      acc[l.studentId] = (acc[l.studentId] ?? 0) + 1
    }
    return acc
  }, {})

  const handleGenerateSlots = () => {
    const newSettings = { ...settings, isLessonDay: true }
    dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: newSettings })
    const items = generateTimeItems(date, newSettings, [])
    const existingIds = new Set(lessons.filter((l) => l.date === date).map((l) => l.id))
    const [y, m, d] = date.split('-').map(Number)
    const day_of_week = new Date(y, m - 1, d).getDay()
    const masterMap = new Map(
      state.weekly_masters
        .filter((w) => w.day_of_week === day_of_week)
        .map((w) => [`${w.slot_index}`, w.student_id])
    )
    items.forEach((item) => {
      if (item.type !== 'slot' || !item.slot || existingIds.has(item.slot.id)) return
      const slot_index = typeof item.slotIndex === 'number' ? item.slotIndex - 1 : 0
      const student_id = masterMap.get(String(slot_index))
      const payload = {
        ...item.slot,
        status: student_id ? ('confirmed' as const) : ('available' as const),
        ...(student_id ? { studentId: student_id } : {}),
      }
      dispatch({ type: 'ADD_LESSON', payload })
    })
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">{scheduleTitle}</h1>

      {/* 先生用: 本日の誰が何回 */}
      {isTeacher && settings.isLessonDay && Object.keys(todayCountByStudent).length > 0 && (
        <div className="mb-3 px-3 py-2 bg-white rounded-lg border border-gray-100 text-sm text-gray-700">
          <span className="font-medium text-gray-500">本日の受講：</span>
          {Object.entries(todayCountByStudent)
            .map(([id, n]) => `${getUserById(id)?.name ?? ''} ${n}回`)
            .join('、')}
        </div>
      )}

      {/* 先生用: この日がレッスン日でないとき「枠を生成」 */}
      {isTeacher && !settings.isLessonDay && (
        <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
          <p className="text-sm text-gray-600">この日をレッスン日にして、09:00〜の時間割枠を生成します。</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-500">終了時刻</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {(['16:30', '20:00'] as EndTimeMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: { ...settings, endTimeMode: mode } })}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    settings.endTimeMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  〜{mode}
                </button>
              ))}
            </div>
            <Button onClick={handleGenerateSlots} className="gap-1.5">
              <Plus size={16} />
              枠を生成
            </Button>
          </div>
        </div>
      )}

      {/* 先生用: レッスン日なら終了時間切替 */}
      {isTeacher && settings.isLessonDay && (
        <div className="mb-3">
          <EndTimeSwitcher settings={settings} />
        </div>
      )}

      <DayTimetable date={date} />
    </div>
  )
}
