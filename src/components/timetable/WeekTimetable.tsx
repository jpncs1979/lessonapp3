'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '@/lib/store'
import {
  generateTimeItems,
  formatDateToYYYYMMDD,
  getWeekDateRangeMonday,
  formatWeekRangeJa,
  timeToMinutes,
  today,
} from '@/lib/schedule'
import type { DaySettings, EndTimeMode, LessonSlot } from '@/types'
import { cn, generateId } from '@/lib/utils'
import BookingModal from '@/components/booking/BookingModal'

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

interface WeekTimetableProps {
  anchorDate: string
}

export default function WeekTimetable({ anchorDate }: WeekTimetableProps) {
  const router = useRouter()
  const { state, dispatch, getDaySettings, getLessonsForDate, getUserById, getAvailabilitiesForSlot } = useApp()
  const { currentUser, lessons } = state
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const weekDates = useMemo(() => getWeekDateRangeMonday(anchorDate), [anchorDate])
  const weekLabel = useMemo(() => formatWeekRangeJa(weekDates), [weekDates])
  const todayStr = today()

  const isTeacher = currentUser?.role === 'teacher'
  const isAccompanist = currentUser?.role === 'accompanist'

  const { slotMap, sortedStartTimes } = useMemo(() => {
    const map = new Map<string, LessonSlot>()
    const times = new Set<string>()
    for (const ds of weekDates) {
      const settings = getDaySettings(ds)
      if (!settings.isLessonDay) continue
      const items = generateTimeItems(ds, settings, getLessonsForDate(ds))
      for (const item of items) {
        if (item.type === 'slot' && item.slot) {
          times.add(item.startTime)
          map.set(`${ds}::${item.startTime}`, item.slot)
        }
      }
    }
    const sorted = [...times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    return { slotMap: map, sortedStartTimes: sorted }
  }, [weekDates, state.daySettings, state.lessons, getDaySettings, getLessonsForDate])

  const monday = weekDates[0]
  const prevWeek = () => {
    const [y, m, d] = monday.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - 7)
    router.push(`/day/${formatDateToYYYYMMDD(dt)}`)
  }
  const nextWeek = () => {
    const [y, m, d] = monday.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + 7)
    router.push(`/day/${formatDateToYYYYMMDD(dt)}`)
  }
  const goThisWeek = () => {
    const t = today()
    const [y, m, d] = t.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    router.push(`/day/${formatDateToYYYYMMDD(dt)}`)
  }

  useEffect(() => {
    for (const ds of weekDates) {
      router.prefetch(`/day/${ds}?mode=day`)
    }
  }, [weekDates, router])

  const viewingThisWeek = weekDates.includes(todayStr)

  /** 月カレンダーの applyLessonDay と同じ（実施日 ON で枠生成） */
  const applyLessonDayToggle = (dateStr: string, nextIsLessonDay: boolean) => {
    const s = getDaySettings(dateStr)
    const wasLessonDay = s.isLessonDay
    const nextDaySettings: DaySettings = {
      ...s,
      isLessonDay: nextIsLessonDay,
      ...(nextIsLessonDay ? { endTimeMode: '20:00' as EndTimeMode } : {}),
    }
    dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: nextDaySettings })
    if (nextIsLessonDay) {
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

  const handleSlotClick = (slot: LessonSlot) => {
    if (slot.status === 'break' || slot.status === 'lunch') return
    if (isTeacher) {
      if (slot.status === 'blocked') {
        const inState = lessons.some((l) => l.id === slot.id)
        if (inState) {
          dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, status: 'available' } })
        } else {
          dispatch({ type: 'ADD_LESSON', payload: { ...slot, status: 'available' } })
        }
        return
      }
      if (slot.status === 'available') {
        const inState = lessons.some((l) => l.id === slot.id)
        if (inState) {
          dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, status: 'blocked' } })
        } else {
          dispatch({ type: 'ADD_LESSON', payload: { ...slot, status: 'blocked' } })
        }
        return
      }
      setSelectedSlot(slot)
      setModalOpen(true)
      return
    }
    if (isAccompanist && currentUser) {
      const availabilities = getAvailabilitiesForSlot(slot.id)
      const myAv = availabilities.find((a) => a.accompanistId === currentUser.id)
      if (slot.status === 'available') {
        if (myAv) {
          dispatch({ type: 'REMOVE_AVAILABILITY', payload: { slotId: slot.id, accompanistId: currentUser.id } })
        } else {
          dispatch({
            type: 'ADD_AVAILABILITY',
            payload: { id: generateId(), slotId: slot.id, accompanistId: currentUser.id, createdAt: new Date().toISOString() },
          })
        }
        return
      }
      if (slot.status === 'confirmed' && slot.studentId && !slot.accompanistId) {
        dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, accompanistId: currentUser.id } })
        return
      }
      if (slot.status === 'confirmed' && slot.accompanistId === currentUser.id) {
        dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, accompanistId: undefined } })
        return
      }
    }
    if (currentUser?.role === 'student') return
    if (slot.status === 'blocked') return
    setSelectedSlot(slot)
    setModalOpen(true)
  }

  const handleCancelForStudent = (slot: LessonSlot) => {
    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: undefined,
        accompanistId: undefined,
        status: 'available',
        provisionalDeadline: undefined,
      },
    })
  }

  const compactCellLabel = (slot: LessonSlot): string => {
    const student = getUserById(slot.studentId)
    const acc = getUserById(slot.accompanistId)
    if (slot.status === 'available') return '空'
    if (slot.status === 'blocked') return '不可'
    if (slot.status === 'pending') return student ? `${student.name.slice(0, 4)}…` : '仮'
    if (slot.status === 'confirmed') {
      if (acc && student) return `${student.name.slice(0, 3)}…`
      if (student) return student.name.length > 5 ? `${student.name.slice(0, 4)}…` : student.name
      if (acc) return `奏:${acc.name.slice(0, 2)}`
    }
    return '—'
  }

  const cellClass = (slot: LessonSlot | undefined, hasDay: boolean) => {
    if (!hasDay) return 'bg-gray-100 text-gray-300'
    if (!slot) return 'bg-gray-50 text-gray-300'
    return cn(
      'border border-gray-200',
      slot.status === 'available' && 'bg-white text-gray-800',
      slot.status === 'blocked' && 'bg-gray-200 text-gray-600',
      (slot.status === 'confirmed' || slot.status === 'pending') && 'bg-blue-50 text-blue-900',
    )
  }

  if (!currentUser) return null

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button
            type="button"
            onClick={prevWeek}
            className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50"
            aria-label="前の週"
          >
            <ChevronLeft size={16} />
            前週
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50"
            aria-label="次の週"
          >
            翌週
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <p className="text-xs text-gray-600 font-medium tabular-nums">{weekLabel}</p>
          <button
            type="button"
            onClick={goThisWeek}
            disabled={viewingThisWeek}
            className={cn(
              'text-xs font-medium px-2.5 py-1 rounded-lg border',
              viewingThisWeek ? 'border-gray-200 text-gray-400' : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
            )}
          >
            今週
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2">
        <table className="w-full min-w-[720px] border-collapse text-[10px] sm:text-xs table-fixed">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-20 bg-gray-50 p-1 w-[2.75rem] sm:w-12 text-left font-medium text-gray-500 align-bottom">
                時刻
              </th>
              {weekDates.map((ds, colIdx) => {
                const settings = getDaySettings(ds)
                const [, m, d] = ds.split('-').map(Number)
                const isTodayCol = ds === todayStr
                return (
                  <th
                    key={ds}
                    className={cn(
                      'p-1 font-normal align-bottom min-w-0',
                      isTodayCol && 'bg-indigo-50/80'
                    )}
                  >
                    <div className="flex flex-col items-center gap-1 min-w-0 py-0.5">
                      <span className="text-[9px] sm:text-[10px] text-gray-500">{WEEKDAY_LABELS[colIdx]}</span>
                      <span className={cn('text-[11px] sm:text-xs font-semibold tabular-nums', isTodayCol && 'text-indigo-800')}>
                        {m}/{d}
                      </span>
                      {isTeacher && (
                        <div className="flex flex-col items-center gap-0.5 w-full">
                          <span className="text-[8px] sm:text-[9px] text-gray-500">実施</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={settings.isLessonDay}
                            aria-label={`${m}月${d}日 レッスン実施`}
                            onClick={() => applyLessonDayToggle(ds, !settings.isLessonDay)}
                            className={cn(
                              'relative w-8 h-4 sm:w-9 sm:h-5 rounded-full transition-colors shrink-0',
                              settings.isLessonDay ? 'bg-indigo-600' : 'bg-gray-300'
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-0.5 w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full shadow transition-transform',
                                settings.isLessonDay ? 'translate-x-3.5 sm:translate-x-4' : 'translate-x-0.5'
                              )}
                            />
                          </button>
                          <span className="text-[8px] leading-none text-gray-500">
                            {settings.isLessonDay ? 'あり' : 'なし'}
                          </span>
                        </div>
                      )}
                      {isTeacher && settings.isLessonDay && (
                        <Link
                          href={`/day/${ds}?mode=day`}
                          className="text-[9px] text-gray-400 hover:text-indigo-600"
                        >
                          設定
                        </Link>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedStartTimes.map((startTime) => (
              <tr key={startTime} className="border-b border-gray-100">
                <td className="sticky left-0 z-10 bg-gray-50 p-0.5 sm:p-1 font-mono text-[9px] sm:text-[10px] text-gray-500 whitespace-nowrap">
                  {startTime}
                </td>
                {weekDates.map((ds) => {
                  const settings = getDaySettings(ds)
                  if (!settings.isLessonDay) {
                    return (
                      <td key={ds} className="p-0.5 align-middle bg-gray-50/80">
                        <div className="min-h-[2rem] sm:min-h-[2.25rem] rounded border border-transparent flex items-center justify-center text-gray-300">
                          —
                        </div>
                      </td>
                    )
                  }
                  const slot = slotMap.get(`${ds}::${startTime}`)
                  const clickable =
                    slot &&
                    (isTeacher ||
                      isAccompanist ||
                      (currentUser.role === 'student' &&
                        (slot.status === 'available' ||
                          ((slot.status === 'confirmed' || slot.status === 'pending') && slot.studentId === currentUser.id))))

                  const studentDayBlock =
                    currentUser.role === 'student' &&
                    getLessonsForDate(ds).some(
                      (l) => (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id
                    )

                  return (
                    <td key={`${ds}-${startTime}`} className="p-0.5 align-middle">
                      {!slot ? (
                        <div className="min-h-[2rem] sm:min-h-[2.25rem] rounded bg-gray-50/50 border border-transparent" />
                      ) : currentUser.role === 'student' ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (slot.status === 'available' && studentDayBlock) return
                            if (slot.status === 'available' || slot.status === 'blocked') {
                              router.push(`/day/${ds}?mode=day`)
                              return
                            }
                            if (slot.status === 'confirmed' || slot.status === 'pending') {
                              if (slot.studentId === currentUser.id) {
                                handleCancelForStudent(slot)
                              } else {
                                router.push(`/day/${ds}?mode=day`)
                              }
                            }
                          }}
                          className={cn(
                            'w-full min-h-[2rem] sm:min-h-[2.25rem] rounded px-0.5 py-0.5 text-center leading-tight',
                            cellClass(slot, true),
                            slot.status === 'available' && studentDayBlock && 'opacity-40 cursor-not-allowed',
                            'cursor-pointer active:scale-[0.98]'
                          )}
                        >
                          <span className="line-clamp-2 break-all">{compactCellLabel(slot)}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => slot && handleSlotClick(slot)}
                          className={cn(
                            'w-full min-h-[2rem] sm:min-h-[2.25rem] rounded px-0.5 py-0.5 text-center leading-tight',
                            cellClass(slot, true),
                            clickable && 'cursor-pointer hover:opacity-90 active:scale-[0.98]',
                            !clickable && 'cursor-default'
                          )}
                        >
                          <span className="line-clamp-2 break-all">{compactCellLabel(slot)}</span>
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedStartTimes.length === 0 && (
        <p className="text-sm text-gray-500 py-6 text-center">
          この週にレッスン実施日がありません。各曜日の「実施」をオンにすると枠が入ります。
        </p>
      )}

      <BookingModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setSelectedSlot(null)
        }}
        slot={selectedSlot}
      />
    </div>
  )
}
