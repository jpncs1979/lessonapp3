'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Calendar, ChevronLeft, ChevronRight, Users, Clock, UserPlus, CalendarDays } from 'lucide-react'
import { useApp } from '@/lib/store'
import { generateTimeItems, getDaysInMonth } from '@/lib/schedule'
import { cn, getTeacherGroupLabel } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { DaySettings, EndTimeMode } from '@/types'

export default function SettingsPage() {
  const { state, dispatch, getDaySettings } = useApp()
  const { currentUser } = state

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  )
  const [saved, setSaved] = useState(false)

  if (!currentUser || currentUser.role !== 'teacher') {
    return <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
  }

  const days = getDaysInMonth(year, month)
  const settings = getDaySettings(selectedDate)

  const updateSettings = (patch: Partial<DaySettings>) => {
    dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: { ...settings, ...patch } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const { students, accompanists } = state

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1) } else setMonth((m) => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1) } else setMonth((m) => m + 1) }

  const getLessons = (date: string) => state.lessons.filter((l) => l.date === date)

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">{getTeacherGroupLabel(currentUser.name)} レッスン実施スケジュール</h1>
      <p className="text-sm text-gray-500 mb-5">日ごとのレッスン設定を管理します</p>

      {/* 月ナビ */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-gray-800">{year}年{month}月</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
      </div>

      {/* 日付選択 */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5">
        {days.map((dateStr) => {
          const d = new Date(dateStr + 'T00:00:00')
          const dayNames = ['日', '月', '火', '水', '木', '金', '土']
          const isSelected = dateStr === selectedDate
          const s = getDaySettings(dateStr)
          const isSun = d.getDay() === 0

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={cn(
                'flex-shrink-0 w-12 py-2 rounded-xl text-center border transition-colors',
                isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 hover:border-indigo-300',
                !s.isLessonDay && !isSelected && 'opacity-40'
              )}
            >
              <p className={cn('text-xs', isSelected ? 'text-indigo-100' : isSun ? 'text-red-500' : 'text-gray-500')}>
                {dayNames[d.getDay()]}
              </p>
              <p className={cn('text-sm font-semibold', isSelected ? 'text-white' : 'text-gray-800')}>{d.getDate()}</p>
              {s.isLessonDay && !isSelected && (
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mx-auto mt-0.5" />
              )}
            </button>
          )
        })}
      </div>

      {/* 設定パネル */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
        {/* 保存通知 */}
        {saved && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
            <Check size={15} /><span>保存しました</span>
          </div>
        )}

        {/* レッスンあり/なし */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">レッスン実施</p>
            <p className="text-xs text-gray-500">チェックを入れるとレッスン日として公開します</p>
          </div>
          <button
            onClick={() => updateSettings({ isLessonDay: !settings.isLessonDay })}
            className={cn('relative w-11 h-6 rounded-full transition-colors', settings.isLessonDay ? 'bg-indigo-600' : 'bg-gray-300')}
          >
            <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.isLessonDay ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>

        {settings.isLessonDay && (
          <>
            {/* 終了時間 */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">終了時間</p>
              <div className="grid grid-cols-2 gap-2">
                {(['16:30', '20:00'] as EndTimeMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateSettings({ endTimeMode: mode })}
                    className={cn(
                      'py-2.5 rounded-xl border-2 text-sm font-medium transition-colors',
                      settings.endTimeMode === mode
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    〜{mode}
                  </button>
                ))}
              </div>
            </div>

            {/* 昼休み */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">昼休み（12:10〜13:00）をレッスン枠として開放</p>
              </div>
              <button
                onClick={() => updateSettings({ lunchBreakOpen: !settings.lunchBreakOpen })}
                className={cn('relative w-11 h-6 rounded-full transition-colors', settings.lunchBreakOpen ? 'bg-indigo-600' : 'bg-gray-300')}
              >
                <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', settings.lunchBreakOpen ? 'translate-x-6' : 'translate-x-1')} />
              </button>
            </div>

            {/* 仮押さえ時間 */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">仮押さえ期限</p>
              <div className="grid grid-cols-2 gap-2">
                {([24, 48] as (24 | 48)[]).map((hours) => (
                  <button
                    key={hours}
                    onClick={() => updateSettings({ provisionalHours: hours })}
                    className={cn(
                      'py-2.5 rounded-xl border-2 text-sm font-medium transition-colors',
                      settings.provisionalHours === hours
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {hours}時間
                  </button>
                ))}
              </div>
            </div>

            {/* 教室名 */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-2">デフォルト教室</p>
              <input
                type="text"
                value={settings.defaultRoom}
                onChange={(e) => updateSettings({ defaultRoom: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="例: 1号館120"
              />
            </div>

            {/* スロット数プレビュー */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><Clock size={12} />この設定での総スロット数</p>
              <SlotPreview date={selectedDate} />
            </div>
          </>
        )}
      </div>

      {/* 名簿・週間マスターへのリンク */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/roster"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <UserPlus size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">名簿管理</p>
            <p className="text-xs text-gray-500">学生・伴奏者の追加・編集・削除</p>
          </div>
        </Link>
        <Link
          href="/settings/weekly-master"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <CalendarDays size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">週間マスター</p>
            <p className="text-xs text-gray-500">曜日・時間枠ごとの受講生テンプレート</p>
          </div>
        </Link>
      </div>

      {/* 登録ユーザー概要 */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><Users size={15} />登録状況</h2>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>生徒 {students.length}名</span>
          <span>伴奏者 {accompanists.length}名</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">詳細は名簿管理で編集できます</p>
      </div>
    </div>
  )
}

function SlotPreview({ date }: { date: string }) {
  const { getDaySettings, getLessonsForDate } = useApp()
  const settings = getDaySettings(date)
  const lessons = getLessonsForDate(date)
  const items = generateTimeItems(date, settings, lessons)
  const slotCount = items.filter((i) => i.type === 'slot').length
  const breakCount = items.filter((i) => i.type === 'break').length

  return (
    <p className="text-sm text-indigo-700 font-medium">
      {slotCount}コマ（休憩{breakCount}回、{settings.lunchBreakOpen ? '昼休みなし' : '昼休みあり'}）
    </p>
  )
}
