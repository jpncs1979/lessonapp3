'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import { generateTimeItems, getDaySummary, getDaysInMonth, today } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { DaySettings, EndTimeMode } from '@/types'

const SWIPE_THRESHOLD = 50

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 日付セル内のマーカー（生徒は主に丸、レッスンのみ文字） */
type CalendarDayMark =
  | { kind: 'none' }
  | { kind: 'dash' }
  | { kind: 'dot'; className: string }
  | { kind: 'pill'; text: string; className: string }

export default function MonthCalendar() {
  const router = useRouter()
  const { state, dispatch, getDaySettings, getLessonsForDate } = useApp()
  const { currentUser } = state
  const now = new Date()
  const CALENDAR_VIEW_KEY = 'lessonapp3_calendar_view_year_month'

  const storedView = (() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.sessionStorage.getItem(CALENDAR_VIEW_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { year?: number; month?: number }
      if (typeof parsed?.year !== 'number' || typeof parsed?.month !== 'number') return null
      if (parsed.month < 1 || parsed.month > 12) return null
      return parsed
    } catch {
      return null
    }
  })()

  const [year, setYear] = useState(storedView?.year ?? now.getFullYear())
  const [month, setMonth] = useState(storedView?.month ?? now.getMonth() + 1)
  const touchStartX = useRef<number | null>(null)
  const dayGridRef = useRef<HTMLDivElement>(null)

  const days = getDaysInMonth(year, month)
  const firstDay = new Date(year, month - 1, 1).getDay() // 0=日

  // 前月の末尾で埋める空白
  const blanks = Array(firstDay).fill(null)
  const todayStr = today()

  const isTeacher = currentUser?.role === 'teacher'
  const PRESS_TO_BULK_MS = 250

  // 表示中の年/月を保存し、戻ってきたときに同じ月へ復元する
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CALENDAR_VIEW_KEY, JSON.stringify({ year, month }))
    } catch { /* ignore */ }
  }, [year, month])

  // 長押しで「空き無し/不可」切替時にラベル文字が選択状態にならないようにする
  useEffect(() => {
    const el = dayGridRef.current
    if (!el) return
    const prevent = (e: Event) => e.preventDefault()
    el.addEventListener('selectstart', prevent)
    return () => el.removeEventListener('selectstart', prevent)
  }, [])

  // 先生向け：複数選択モード（短いクリックで選択し、ボタンで一括反映）
  const [selectMode, setSelectMode] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const multiSelectAnchorRef = useRef<string | null>(null)

  // 半押し（一定時間押下後）で範囲を一括切替する
  const bulkPressTimerRef = useRef<number | null>(null)
  const bulkLongPressTriggeredRef = useRef(false)
  // 長押し成立後の click 発火を抑止（長押し＝切替のみ、クリック＝詳細へ）
  const suppressNextClickRef = useRef(false)
  const bulkStartDateRef = useRef<string | null>(null)
  const bulkTargetIsLessonDayRef = useRef<boolean>(false)
  const bulkAppliedDatesRef = useRef<Set<string>>(new Set())
  const [bulkPreview, setBulkPreview] = useState<{ from: string; to: string; target: boolean } | null>(null)

  const parseYYYYMMDDToDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const buildDateRange = (from: string, to: string): string[] => {
    const start = parseYYYYMMDDToDate(from)
    const end = parseYYYYMMDDToDate(to)
    const rangeStart = start.getTime() <= end.getTime() ? start : end
    const rangeEnd = start.getTime() <= end.getTime() ? end : start
    const res: string[] = []

    // YYYY-MM-DD はローカル日付として扱う（端末表示とズレないように）
    const cur = new Date(rangeStart)
    while (cur.getTime() <= rangeEnd.getTime()) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      res.push(`${y}-${m}-${d}`)
      cur.setDate(cur.getDate() + 1)
    }
    return res
  }

  const isDateInRange = (dateStr: string, from: string, to: string): boolean => {
    const d = parseYYYYMMDDToDate(dateStr).getTime()
    const a = parseYYYYMMDDToDate(from).getTime()
    const b = parseYYYYMMDDToDate(to).getTime()
    const min = a <= b ? a : b
    const max = a <= b ? b : a
    return d >= min && d <= max
  }

  const applyLessonDay = (dateStr: string, isLessonDay: boolean) => {
    const settings = getDaySettings(dateStr)
    const wasLessonDay = settings.isLessonDay
    const nextDaySettings: DaySettings = {
      ...settings,
      isLessonDay,
      // 可能日にしたときのデフォルトは 20:00（後で日付設定で変更可能）
      ...(isLessonDay ? { endTimeMode: '20:00' as EndTimeMode } : {}),
    }
    dispatch({
      type: 'UPSERT_DAY_SETTINGS',
      payload: {
        ...nextDaySettings,
      },
    })

    // 不可→可能で枠のラベル（空き/空き無し）を正しく出すため、
    // 可能にした瞬間にその日の lessons を作り直す。
    // 不可→可能のときは週間マスターを当てず全枠「空き」にする（長押し切替の期待どおり）
    if (isLessonDay) {
      dispatch({
        type: 'GENERATE_LESSONS_FOR_DATE',
        payload: {
          date: dateStr,
          daySettings: nextDaySettings,
          openAsAllAvailable: !wasLessonDay,
        },
      })
    }
  }

  const isSelectedDate = (dateStr: string) => selectedDates.includes(dateStr)

  const toggleSelectedDate = (dateStr: string) => {
    setSelectedDates((prev) => (prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]))
  }

  const applySelectedDates = (isLessonDay: boolean) => {
    for (const d of selectedDates) applyLessonDay(d, isLessonDay)
    setSelectedDates([])
    multiSelectAnchorRef.current = null
    setSelectMode(false)
  }

  const applyLessonDayRange = (from: string, to: string, isLessonDay: boolean) => {
    const dates = buildDateRange(from, to)
    for (const d of dates) {
      if (bulkAppliedDatesRef.current.has(d)) continue
      bulkAppliedDatesRef.current.add(d)
      applyLessonDay(d, isLessonDay)
    }
  }

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

  /** 日付セル内のマーカー（役割別） */
  const getDayMark = (dateStr: string): CalendarDayMark => {
    const lessons = getLessonsForDate(dateStr)
    const dayInfo = getDayInfo(dateStr)
    const isLessonDay = !!dayInfo

    if (!currentUser) {
      if (!isLessonDay) return { kind: 'dash' }
      const available = dayInfo!.available ?? 0
      if (available === 0) return { kind: 'dot', className: 'bg-gray-400' }
      return { kind: 'dot', className: 'bg-emerald-500' }
    }

    if (currentUser.role === 'student') {
      if (!isLessonDay) return { kind: 'dash' }
      const myLessons = lessons.filter((l) => (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id)
      if (myLessons.length > 0) {
        return {
          kind: 'pill',
          text: 'レッスン',
          className: 'text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium',
        }
      }
      const available = dayInfo!.available ?? 0
      if (available === 0) return { kind: 'dot', className: 'bg-gray-400' }
      return { kind: 'dot', className: 'bg-emerald-500' }
    }

    if (currentUser.role === 'teacher') {
      if (!isLessonDay) return { kind: 'dash' }
      const booked = (dayInfo!.confirmed ?? 0) + (dayInfo!.pending ?? 0)
      const available = dayInfo!.available ?? 0
      const text = `${booked}`
      if (available === 0) {
        return {
          kind: 'pill',
          text,
          className: 'text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium tabular-nums',
        }
      }
      // 空き枠が1つでもあれば凡例どおり緑系（予約件数バッジのまま）
      return {
        kind: 'pill',
        text,
        className: 'text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium tabular-nums',
      }
    }

    if (currentUser.role === 'accompanist') {
      return { kind: 'none' }
    }

    return { kind: 'none' }
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

      {/* 生徒：マーカー凡例（セル内は ー / 丸／「レッスン」バッジ） */}
      {currentUser?.role === 'student' && (
        <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50/40 text-[10px] text-gray-500 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="text-gray-300 leading-none">ー</span>
            <span>不可</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" aria-hidden />
            <span>空きなし</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
            <span>空きあり</span>
          </span>
        </div>
      )}

      {/* 先生向け：操作ガイド */}
      {isTeacher && (
        <div className="px-3 py-2 border-b border-gray-100 bg-indigo-50/60 text-[10px] text-indigo-700">
          <p className="text-center text-gray-600 leading-snug px-1 mb-2">
            <span className="inline-flex items-center gap-0.5">
              <span className="text-gray-400 font-medium leading-none">ー</span>
              <span>は不可、</span>
            </span>
            <span className="inline-flex items-center gap-1 mx-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400 shrink-0 align-middle" aria-hidden />
              <span>は空きなし、</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0 align-middle" aria-hidden />
              <span>は空きあり</span>
            </span>
            <span>。</span>
          </p>
          <div className="flex items-center justify-center gap-3">
            <span>クリックで詳細へ、長押しで可能/不可を切替（範囲一括）</span>
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => !v)
                setSelectedDates([])
                multiSelectAnchorRef.current = null
                // 長押し/範囲切替の状態をリセット（モード干渉防止）
                if (bulkPressTimerRef.current != null) window.clearTimeout(bulkPressTimerRef.current)
                bulkPressTimerRef.current = null
                bulkLongPressTriggeredRef.current = false
                bulkStartDateRef.current = null
                bulkTargetIsLessonDayRef.current = false
                bulkAppliedDatesRef.current = new Set()
                setBulkPreview(null)
              }}
              className={cn(
                'px-2 py-1 rounded-lg border text-[10px] font-medium transition-colors',
                selectMode
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white/70 border-indigo-200 text-indigo-700 hover:bg-white'
              )}
            >
              複数選択：{selectMode ? 'ON' : 'OFF'}
            </button>
          </div>
          {selectMode && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => applySelectedDates(true)}
                disabled={selectedDates.length === 0}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-[10px] font-medium transition-colors',
                  selectedDates.length === 0
                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                )}
              >
                選択中を可能
              </button>
              <button
                type="button"
                onClick={() => applySelectedDates(false)}
                disabled={selectedDates.length === 0}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-[10px] font-medium transition-colors',
                  selectedDates.length === 0
                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-200 border-gray-300 text-gray-700 hover:bg-gray-300'
                )}
              >
                選択中を不可
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDates([])
                  multiSelectAnchorRef.current = null
                }}
                disabled={selectedDates.length === 0}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-[10px] font-medium transition-colors',
                  selectedDates.length === 0
                    ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                )}
              >
                選択解除（{selectedDates.length}）
              </button>
            </div>
          )}
        </div>
      )}

      {/* 日付グリッド（モバイルでスクロール可能） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={dayGridRef}
          className="grid grid-cols-7 select-none"
          style={{ WebkitUserSelect: 'none' }}
        >
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} className="min-h-[52px] sm:min-h-[72px] border-b border-r border-gray-50 last:border-r-0" />
        ))}

        {days.map((dateStr, i) => {
          const dayNum = new Date(dateStr + 'T00:00:00').getDate()
          const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay()
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr
          const col = (i + firstDay) % 7

          const mark = getDayMark(dateStr)
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
              onClick={(e) => {
                if (!isTeacher) {
                  router.push(`/day/${dateStr}`)
                  return
                }
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false
                  return
                }
                if (selectMode) {
                  if (e.shiftKey) {
                    const anchor = multiSelectAnchorRef.current ?? dateStr
                    const range = buildDateRange(anchor, dateStr)
                    multiSelectAnchorRef.current = anchor
                    setSelectedDates(range)
                    return
                  }
                  multiSelectAnchorRef.current = dateStr
                  toggleSelectedDate(dateStr)
                  return
                }
                router.push(`/day/${dateStr}`)
              }}
              onPointerDown={(e) => {
                if (!isTeacher) return
                if (selectMode) return
                // マウスなら左ボタンのみ
                if (e.pointerType === 'mouse' && e.button !== 0) return

                bulkLongPressTriggeredRef.current = false
                bulkStartDateRef.current = dateStr
                bulkTargetIsLessonDayRef.current = !getDaySettings(dateStr).isLessonDay
                bulkAppliedDatesRef.current = new Set([dateStr])
                setBulkPreview({ from: dateStr, to: dateStr, target: bulkTargetIsLessonDayRef.current })

                if (bulkPressTimerRef.current != null) window.clearTimeout(bulkPressTimerRef.current)
                bulkPressTimerRef.current = window.setTimeout(() => {
                  bulkLongPressTriggeredRef.current = true
                  suppressNextClickRef.current = true
                  // 長押し確定：範囲を一括切替
                  applyLessonDay(dateStr, bulkTargetIsLessonDayRef.current)
                }, PRESS_TO_BULK_MS)
              }}
              onPointerEnter={() => {
                if (!isTeacher) return
                if (!bulkLongPressTriggeredRef.current) return
                const start = bulkStartDateRef.current
                if (!start) return
                setBulkPreview((prev) => {
                  if (!prev) return prev
                  return { ...prev, to: dateStr }
                })
                applyLessonDayRange(start, dateStr, bulkTargetIsLessonDayRef.current)
              }}
              onPointerUp={() => {
                if (!isTeacher) return
                if (selectMode) return

                if (bulkPressTimerRef.current != null) {
                  window.clearTimeout(bulkPressTimerRef.current)
                  bulkPressTimerRef.current = null
                }

                const start = bulkStartDateRef.current
                const target = bulkTargetIsLessonDayRef.current
                const didLongPress = bulkLongPressTriggeredRef.current

                bulkLongPressTriggeredRef.current = false
                bulkStartDateRef.current = null
                bulkTargetIsLessonDayRef.current = false
                bulkAppliedDatesRef.current = new Set()
                setBulkPreview(null)

                // 半押しが発動しなかった場合（短いクリック）: その日だけトグルして日程へ
                if (!didLongPress) {
                  // クリックは「詳細ページへ遷移のみ」。切替（applyLessonDay）は長押しだけにする
                  suppressNextClickRef.current = false
                }
              }}
              onPointerCancel={() => {
                if (!isTeacher) return
                if (selectMode) return
                if (bulkPressTimerRef.current != null) {
                  window.clearTimeout(bulkPressTimerRef.current)
                  bulkPressTimerRef.current = null
                }
                bulkLongPressTriggeredRef.current = false
                suppressNextClickRef.current = false
                bulkStartDateRef.current = null
                bulkTargetIsLessonDayRef.current = false
                bulkAppliedDatesRef.current = new Set()
                setBulkPreview(null)
              }}
              className={cn(
                'min-h-[52px] sm:min-h-[72px] p-1 sm:p-1.5 border-b border-r border-gray-50 cursor-pointer transition-colors',
                col === 6 && 'border-r-0',
                isToday ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50',
                isPast && 'opacity-60',
                hasMyAccompaniment && 'ring-2 ring-red-400',
                bulkPreview && isDateInRange(dateStr, bulkPreview.from, bulkPreview.to) &&
                (bulkPreview.target
                  ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-gray-100 border-gray-200 hover:bg-gray-100'),
                selectMode && isSelectedDate(dateStr) && 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-200'
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

              {/* 日付マーカー（丸・ー・バッジ） */}
              <div className="text-center min-h-[18px] flex items-center justify-center">
                {mark.kind === 'dash' && (
                  <span className="text-sm text-gray-300 font-medium leading-none" aria-hidden>
                    ー
                  </span>
                )}
                {mark.kind === 'dot' && (
                  <span
                    className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', mark.className)}
                    aria-hidden
                  />
                )}
                {mark.kind === 'pill' && (
                  <span className={cn('text-center inline-block max-w-full truncate', mark.className)}>
                    {mark.text}
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
