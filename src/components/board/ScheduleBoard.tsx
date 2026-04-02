'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Music, Clock, MapPin } from 'lucide-react'
import { useApp } from '@/lib/store'
import { generateTimeItems, formatDateToYYYYMMDD, today } from '@/lib/schedule'
import { cn, getInitials } from '@/lib/utils'
import { LessonSlot } from '@/types'

export default function ScheduleBoard() {
  const { getDaySettings, getLessonsForDate, getUserById } = useApp()
  const [dateStr, setDateStr] = useState(today())

  const prevDay = () => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1)
    setDateStr(formatDateToYYYYMMDD(dt))
  }
  const nextDay = () => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + 1)
    setDateStr(formatDateToYYYYMMDD(dt))
  }

  const settings = getDaySettings(dateStr)
  const lessons = getLessonsForDate(dateStr)
  const items = generateTimeItems(dateStr, settings, lessons)

  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const dateTitle = `${d.getMonth() + 1}月${d.getDate()}日（${dayNames[d.getDay()]}）のレッスン表`

  // 確定・承認待ちスロットに通し番号をつける
  const indexMap = new Map<string, number>()
  let counter = 0
  items.forEach((item) => {
    if (
      item.type === 'slot' &&
      item.slot &&
      (item.slot.status === 'confirmed' || item.slot.status === 'pending')
    ) {
      counter++
      indexMap.set(item.slot.id, counter)
    }
  })

  return (
    <div>
      {/* 日付ナビ */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevDay} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-gray-900">{dateTitle}</h2>
        </div>
        <button onClick={nextDay} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {!settings.isLessonDay ? (
        <div className="text-center py-16 text-gray-400">
          <Clock size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">この日はレッスンがありません</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => {
            if (item.type === 'break') {
              return (
                <div key={idx} className="flex items-center gap-3 py-1">
                  <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{item.startTime}</span>
                  <div className="flex-1 flex items-center gap-2 h-6">
                    <div className="flex-1 border-t border-dashed border-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">休憩 10分</span>
                    <div className="flex-1 border-t border-dashed border-gray-200" />
                  </div>
                </div>
              )
            }

            if (item.type === 'lunch') {
              return (
                <div key={idx} className="flex items-center gap-3 py-1">
                  <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{item.startTime}</span>
                  <div className="flex-1 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-sm">🍱</span>
                    <span className="text-xs text-orange-600 font-medium">昼休み 〜{item.endTime}</span>
                  </div>
                </div>
              )
            }

            const slot = item.slot
            if (!slot) return null

            if (slot.status === 'available') {
              return (
                <div key={slot.id} className="flex items-start gap-3">
                  <span className="text-xs font-mono text-gray-400 w-10 text-right flex-shrink-0 pt-2.5">{slot.startTime}</span>
                  <div className="flex-1 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-emerald-600 font-medium">レッスン可</span>
                    <span className="text-xs text-gray-400">{slot.startTime}〜{slot.endTime}</span>
                  </div>
                </div>
              )
            }

            if (slot.status === 'confirmed' || slot.status === 'pending') {
              return (
                <BoardCard
                  key={slot.id}
                  slot={slot}
                  index={indexMap.get(slot.id) ?? 0}
                  getUserById={getUserById}
                />
              )
            }

            return null
          })}
        </div>
      )}
    </div>
  )
}

function BoardCard({
  slot, index, getUserById
}: {
  slot: LessonSlot
  index: number
  getUserById: (id?: string) => import('@/types').User | undefined
}) {
  const student = getUserById(slot.studentId)
  const accompanist = getUserById(slot.accompanistId)

  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-mono text-gray-400 w-10 text-right flex-shrink-0 pt-3">{slot.startTime}</span>
      <div className={cn(
        'flex-1 rounded-2xl border p-4 transition-shadow hover:shadow-md',
        slot.status === 'confirmed' ? 'bg-white border-indigo-100' : 'bg-amber-50 border-amber-200'
      )}>
        <div className="flex items-start gap-3">
          {/* 順番番号 */}
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0',
            slot.status === 'confirmed' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-200 text-amber-800'
          )}>
            {index}
          </div>

          <div className="flex-1 min-w-0">
            {/* 時刻 */}
            <div className="flex items-center gap-2 mb-2">
              <Clock size={13} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">{slot.startTime} 〜 {slot.endTime}</span>
            </div>

            {/* 生徒 */}
            {student && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-semibold flex-shrink-0">
                  {getInitials(student.name)}
                </div>
                <p className="text-sm font-medium text-gray-900">{student.name}</p>
              </div>
            )}

            {/* 伴奏者 */}
            {accompanist && (
              <div className="flex items-center gap-1.5 text-teal-700 ml-0.5">
                <Music size={13} />
                <span className="text-xs font-medium">伴奏付き：{accompanist.name}</span>
              </div>
            )}

            {/* 教室 */}
            <div className="flex items-center gap-1 mt-1.5 text-gray-400">
              <MapPin size={11} />
              <span className="text-xs">{slot.roomName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
