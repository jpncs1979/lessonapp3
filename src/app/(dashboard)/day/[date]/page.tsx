'use client'

import { Suspense, use, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DayTimetable from '@/components/timetable/DayTimetable'
import WeekTimetable from '@/components/timetable/WeekTimetable'
import EndTimeSwitcher from '@/components/timetable/EndTimeSwitcher'
import { useApp } from '@/lib/store'
import { getTeacherGroupLabel } from '@/lib/utils'
import { generateTimeItems } from '@/lib/schedule'
import { EndTimeMode } from '@/types'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'

const BLOCKED_STUDENT_ID = '__blocked__'

function formatDayTitle(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function DayPageInner({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const searchParams = useSearchParams()
  const dayMode = searchParams.get('mode') === 'day'

  const { state, dispatch, getDaySettings, getLessonsForDate } = useApp()
  const { currentUser, lessons, users } = state
  const settings = getDaySettings(date)
  const isTeacher = currentUser?.role === 'teacher'

  const teacher = users.find((u) => u.role === 'teacher')

  const handleGenerateSlotsForDay = useCallback(
    (dateStr: string) => {
      const s = getDaySettings(dateStr)
      const newSettings = { ...s, isLessonDay: true }
      dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: newSettings })
      const items = generateTimeItems(dateStr, newSettings, [])
      const existingIds = new Set(lessons.filter((l) => l.date === dateStr).map((l) => l.id))
      const [y, m, d] = dateStr.split('-').map(Number)
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
        const isBlocked = student_id === BLOCKED_STUDENT_ID
        const payload = {
          ...item.slot,
          status: isBlocked ? ('blocked' as const) : student_id ? ('confirmed' as const) : ('available' as const),
          ...(student_id && !isBlocked ? { studentId: student_id } : {}),
        }
        dispatch({ type: 'ADD_LESSON', payload })
      })
    },
    [dispatch, getDaySettings, lessons, state.weekly_masters]
  )

  const scheduleTitleBase = teacher
    ? `${getTeacherGroupLabel(teacher.name)} レッスンスケジュール`
    : 'レッスンスケジュール'

  const scheduleTitle = dayMode
    ? `${scheduleTitleBase}（${formatDayTitle(date)}）`
    : `${scheduleTitleBase}（週）`

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden min-h-[50dvh]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-2">
        <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate min-w-0">{scheduleTitle}</h1>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {dayMode ? (
            <Link href={`/day/${date}`} className="font-medium text-indigo-600 hover:underline">
              週表示に戻る
            </Link>
          ) : (
            <Link href={`/day/${date}?mode=day`} className="font-medium text-indigo-600 hover:underline">
              1日表示
            </Link>
          )}
        </div>
      </div>

      {isTeacher && dayMode && !settings.isLessonDay && (
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
            <Button onClick={() => handleGenerateSlotsForDay(date)} className="gap-1.5">
              <Plus size={16} />
              枠を生成
            </Button>
          </div>
        </div>
      )}

      {isTeacher && dayMode && settings.isLessonDay && (
        <div className="mb-3">
          <EndTimeSwitcher settings={settings} />
        </div>
      )}

      <div className="min-w-0 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {dayMode ? (
          <DayTimetable date={date} />
        ) : (
          <WeekTimetable anchorDate={date} />
        )}
      </div>
    </div>
  )
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40dvh] flex items-center justify-center text-gray-400 text-sm">読み込み中…</div>
      }
    >
      <DayPageInner params={params} />
    </Suspense>
  )
}
