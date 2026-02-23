'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Check } from 'lucide-react'
import { useApp, makeDefaultDaySettings } from '@/lib/store'
import { getLessonSlotList } from '@/lib/schedule'
import { WeeklyMaster } from '@/types'
import Button from '@/components/ui/Button'

const DAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
  { value: 0, label: '日' },
]

function key(day_of_week: number, slot_index: number) {
  return `${day_of_week}-${slot_index}`
}

export default function WeeklyMasterPage() {
  const { state, dispatch } = useApp()
  const { students, weekly_masters, currentUser } = state

  const [localMap, setLocalMap] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const map: Record<string, string> = {}
    weekly_masters.forEach((w) => {
      map[key(w.day_of_week, w.slot_index)] = w.student_id
    })
    setLocalMap(map)
  }, [weekly_masters])

  if (!currentUser || currentUser.role !== 'teacher') {
    return (
      <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
    )
  }

  const settings = { ...makeDefaultDaySettings('2000-01-03'), isLessonDay: true }
  const slotList = getLessonSlotList(settings)

  const getLocalStudentId = (day_of_week: number, slot_index: number) =>
    localMap[key(day_of_week, slot_index)] ?? ''

  const setLocalStudent = (day_of_week: number, slot_index: number, student_id: string) => {
    setLocalMap((prev) => {
      const next = { ...prev }
      if (student_id) next[key(day_of_week, slot_index)] = student_id
      else delete next[key(day_of_week, slot_index)]
      return next
    })
  }

  const handleUpdate = () => {
    const next: WeeklyMaster[] = []
    Object.entries(localMap).forEach(([k, student_id]) => {
      if (!student_id) return
      const [d, s] = k.split('-').map(Number)
      next.push({ day_of_week: d, slot_index: s, student_id })
    })
    dispatch({ type: 'REPLACE_WEEKLY_MASTERS', payload: next })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">週間マスター</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        曜日・時間枠ごとに「この時間は誰が受けるか」のテンプレートを設定します。入力後「更新」を押すとカレンダーでの枠生成に反映されます。
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={handleUpdate} className="gap-1.5">
          <Check size={16} />
          更新（カレンダーに反映）
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
            <Check size={14} />
            反映しました
          </span>
        )}
      </div>

      <div className="space-y-6">
        {DAY_LABELS.map(({ value: day_of_week, label }) => (
          <section key={day_of_week} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">曜日: {label}</h2>
            <div className="space-y-2">
              {slotList.map((row, index) => {
                if (row.isBreak || row.isLunch) {
                  const rowType = row.isLunch ? 'lunch' : 'break'
                  return (
                    <div
                      key={`${day_of_week}-${index}-${row.startTime}-${rowType}`}
                      className="flex items-center gap-3 py-2 px-3 bg-gray-100 rounded-lg text-gray-500 text-sm"
                    >
                      <span className="w-24 flex-shrink-0">{row.startTime} 〜 {row.endTime}</span>
                      <span>{row.isLunch ? '昼休み' : '休憩'}</span>
                    </div>
                  )
                }
                const currentId = getLocalStudentId(day_of_week, row.slot_index)
                return (
                  <div
                    key={`${day_of_week}-${row.slot_index}`}
                    className="flex items-center gap-3 py-2"
                  >
                    <span className="w-24 flex-shrink-0 text-sm text-gray-700">
                      {row.startTime} 〜 {row.endTime}
                    </span>
                    <select
                      value={currentId}
                      onChange={(e) => setLocalStudent(day_of_week, row.slot_index, e.target.value)}
                      className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">（未割り当て）</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
