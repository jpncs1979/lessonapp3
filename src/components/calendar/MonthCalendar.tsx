'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { generateTimeItems, getDaySummary, getDaysInMonth, today } from '@/lib/schedule'
import { cn } from '@/lib/utils'

const SWIPE_THRESHOLD = 50

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function MonthCalendar() {
  const router = useRouter()
  const { state, getDaySettings, getLessonsForDate } = useApp()
  const { currentUser } = state
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const touchStartX = useRef<number | null>(null)

  const days = getDaysInMonth(year, month)
  const firstDay = new Date(year, month - 1, 1).getDay() // 0=日

  // 前月の末尾で埋める空白
  const blanks = Array(firstDay).fill(null)
  const todayStr = today()

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (dx > SWIPE_THRESHOLD) prevMonth()
    else if (dx < -SWIPE_THRESHOLD) nextMonth()
  }

  const getDayInfo = (dateStr: string) => {
    const settings = getDaySettings(dateStr)
    if (!settings.isLessonDay) return null
    const lessons = getLessonsForDate(dateStr)
    const items = generateTimeItems(dateStr, settings, lessons)
    return getDaySummary(items)
  }

  /** 日付の表示ラベル（役割別） */
  const getDayLabel = (dateStr: string): { text: string; className?: string } => {
    const lessons = getLessonsForDate(dateStr)
    const dayInfo = getDayInfo(dateStr)
    const isLessonDay = !!dayInfo

    if (!currentUser) {
      if (!isLessonDay) return { text: '不可', className: 'text-gray-300' }
      return { text: `レッスン可${dayInfo!.available}/${dayInfo!.total}`, className: 'text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium' }
    }

    if (currentUser.role === 'student') {
      if (!isLessonDay) return { text: '不可', className: 'text-gray-300' }
      const myLessons = lessons.filter((l) => (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id)
      if (myLessons.length > 0) return { text: 'レッスン', className: 'text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium' }
      return { text: '空きあり', className: 'text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium' }
    }

    if (currentUser.role === 'teacher') {
      if (!isLessonDay) return { text: '不可', className: 'text-gray-300' }
      const available = dayInfo!.available ?? 0
      if (available === 0) return { text: '空き無し', className: 'text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium' }
      const confirmedOrPending = lessons.filter((l) => l.status === 'confirmed' || l.status === 'pending')
      const n = confirmedOrPending.length
      if (n > 0) return { text: `レッスンあり ${n}`, className: 'text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium' }
      return { text: '空き', className: 'text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium' }
    }

    if (currentUser.role === 'accompanist') {
      // 伴奏者：赤枠で「私のレッスン」を示すため、同じ内容のテキストラベルは出さない
      return { text: '', className: '' }
    }

    return { text: '', className: '' }
  }

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden touch-pan-y max-h-[calc(100dvh-8rem)] sm:max-h-none flex flex-col sm:block"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-4 border-b border-gray-100 flex-shrink-0">
        <button onClick={prevMonth} className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={18} className="text-gray-600" />
        </button>
        <h2 className="text-sm sm:text-base font-semibold text-gray-900">
          {year}年 {month}月
        </h2>
        <button onClick={nextMonth} className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 border-b border-gray-100 flex-shrink-0">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-1 sm:py-2 text-center text-[10px] sm:text-xs font-medium',
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            )}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 伴奏者用：凡例（門下レッスン〇・私のレッスン赤枠） */}
      {currentUser?.role === 'accompanist' && (
        <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 text-[10px] text-gray-500 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
          <span>〇 門下レッスンのある日</span>
          <span>赤枠 伴奏付き（私のレッスン）のある日</span>
        </div>
      )}

      {/* 日付グリッド（モバイルでスクロール可能） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-7">
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} className="min-h-[52px] sm:min-h-[72px] border-b border-r border-gray-50 last:border-r-0" />
        ))}

        {days.map((dateStr, i) => {
          const dayNum = new Date(dateStr + 'T00:00:00').getDate()
          const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay()
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          const col = (i + firstDay) % 7

          const label = getDayLabel(dateStr)
          const dayInfo = getDayInfo(dateStr)
          const isLessonDay = !!dayInfo
          const lessonsOnDay = getLessonsForDate(dateStr)
          const hasMyAccompaniment =
            currentUser?.role === 'accompanist' &&
            lessonsOnDay.some(
              (l) =>
                (l.status === 'confirmed' || l.status === 'pending') && l.accompanistId === currentUser.id
            )

          return (
            <div
              key={dateStr}
              onClick={() => router.push(`/day/${dateStr}`)}
              className={cn(
                'min-h-[52px] sm:min-h-[72px] p-1 sm:p-1.5 border-b border-r border-gray-50 cursor-pointer transition-colors',
                col === 6 && 'border-r-0',
                isToday ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50',
                isPast && 'opacity-60',
                hasMyAccompaniment && 'ring-2 ring-red-400'
              )}
            >
              {/* 日付番号 */}
              <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                <span
                  className={cn(
                    'w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-xs sm:text-sm font-medium',
                    isToday
                      ? 'bg-indigo-600 text-white'
                      : col === 0
                      ? 'text-red-500'
                      : col === 6
                      ? 'text-blue-500'
                      : 'text-gray-700'
                  )}
                >
                  {dayNum}
                </span>
                {/* 伴奏者用：門下レッスンのある日は小さい〇 */}
                {currentUser?.role === 'accompanist' && isLessonDay && (
                  <span className="text-[10px] text-gray-400 leading-none mt-0.5">〇</span>
                )}
              </div>

              {/* 日付ラベル（役割別） */}
              <div className="text-center">
                {label.text && (
                  <span className={cn('text-center inline-block', label.className)}>
                    {label.text}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
