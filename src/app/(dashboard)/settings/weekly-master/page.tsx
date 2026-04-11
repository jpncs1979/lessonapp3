'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Check, Download, Save } from 'lucide-react'
import { useApp, makeDefaultDaySettings } from '@/lib/store'
import { cn } from '@/lib/utils'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchWeeklyMasters, persistState, persistWeeklyMasters } from '@/lib/supabase/sync'
import { getLessonSlotList } from '@/lib/schedule'
import { today } from '@/lib/schedule'
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

const BLOCKED_STUDENT_ID = '__blocked__'

function buildMastersFromLocalMap(localMap: Record<string, string>): WeeklyMaster[] {
  const next: WeeklyMaster[] = []
  Object.entries(localMap).forEach(([k, student_id]) => {
    if (!student_id) return
    const [d, s] = k.split('-').map(Number)
    next.push({ day_of_week: d, slot_index: s, student_id })
  })
  return next
}

function persistErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const c = (err as { code?: unknown }).code
    if (typeof c === 'string' && c.length > 0) return `コード: ${c}`
  }
  return '詳細は取得できませんでした（Supabase の RLS やネットワークを確認してください）'
}

export default function WeeklyMasterPage() {
  const { state, dispatch } = useApp()
  const { students, weekly_masters, currentUser } = state

  const [localMap, setLocalMap] = useState<Record<string, string>>({})
  const [activeDayOfWeek, setActiveDayOfWeek] = useState<number>(() => new Date().getDay())
  const [saveNonce, setSaveNonce] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingFromServer, setLoadingFromServer] = useState(false)

  useEffect(() => {
    const map: Record<string, string> = {}
    weekly_masters.forEach((w) => {
      map[key(w.day_of_week, w.slot_index)] = w.student_id
    })
    setLocalMap(map)
  }, [weekly_masters])

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 4500)
    return () => clearTimeout(t)
  }, [feedback])

  // カレンダー反映後：全体を Supabase に同期（レッスン枠・他テーブル含む）
  useEffect(() => {
    if (saveNonce === 0) return
    let cancelled = false
    const supabase = createSupabaseClient()
    if (!supabase) return
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      const { error } = await persistState(supabase, stateRef.current)
      if (cancelled) return
      if (error) {
        setFeedback({
          ok: false,
          text: `サーバー同期に失敗しました: ${persistErrorMessage(error)}`,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [saveNonce])

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

  /** Supabase から週間マスターを読み込み、画面で確認できるようにする（カレンダーはまだ変えない） */
  const handleLoadFromServer = async () => {
    const supabase = createSupabaseClient()
    if (!supabase) {
      setFeedback({ ok: false, text: 'Supabase が未設定のため読み込めません' })
      return
    }
    setLoadingFromServer(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setFeedback({ ok: false, text: 'ログインセッションがありません。再度ログインしてください' })
        return
      }
      const { data, error } = await fetchWeeklyMasters(supabase)
      if (error || data == null) {
        setFeedback({
          ok: false,
          text: `読み込みに失敗しました: ${error ? persistErrorMessage(error) : 'データがありません'}`,
        })
        return
      }
      dispatch({ type: 'REPLACE_WEEKLY_MASTERS', payload: data })
      setFeedback({
        ok: true,
        text: `サーバーから ${data.length} 件読み込みました。内容を確認し、必要なら編集後に「保存」→「カレンダーに反映」の順で反映してください。`,
      })
    } finally {
      setLoadingFromServer(false)
    }
  }

  /** 週間マスター行だけ Supabase に保存（再ログインで復元されるのはここ） */
  const handleSaveServer = async () => {
    const next = buildMastersFromLocalMap(localMap)
    const supabase = createSupabaseClient()
    if (!supabase) {
      setFeedback({ ok: false, text: 'Supabase が未設定のため保存できません' })
      return
    }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setFeedback({ ok: false, text: 'ログインセッションがありません。再度ログインしてください' })
        return
      }
      const { error } = await persistWeeklyMasters(supabase, next)
      if (error) {
        setFeedback({ ok: false, text: `保存に失敗しました: ${error.message}` })
        return
      }
      dispatch({ type: 'REPLACE_WEEKLY_MASTERS', payload: next })
      setFeedback({ ok: true, text: 'Supabase に保存しました。別の環境でも「読み込み」で同じ内容を取得できます。' })
    } finally {
      setSaving(false)
    }
  }

  /** 画面上の内容を状態に反映し、今日以降のカレンダー枠を作り直し、全体をサーバーへ同期 */
  const handleApplyToCalendar = () => {
    const next = buildMastersFromLocalMap(localMap)
    dispatch({ type: 'REPLACE_WEEKLY_MASTERS', payload: next })
    dispatch({ type: 'APPLY_WEEKLY_MASTERS_TO_LESSONS', payload: { effectiveFromDate: today() } })
    setSaveNonce((n) => n + 1)
    setFeedback({
      ok: true,
      text: 'カレンダーに反映しました。レッスン枠の変更は数秒以内に Supabase へ同期されます。',
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">週間マスター</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className="gap-1.5"
          disabled={loadingFromServer}
          onClick={() => void handleLoadFromServer()}
        >
          <Download size={16} />
          {loadingFromServer ? '読み込み中…' : '読み込み'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="gap-1.5"
          disabled={saving || loadingFromServer}
          onClick={() => void handleSaveServer()}
        >
          <Save size={16} />
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          disabled={loadingFromServer}
          onClick={handleApplyToCalendar}
          className="gap-1.5"
        >
          <Check size={16} />
          カレンダーに反映
        </Button>
        {feedback && (
          <span
            className={`text-sm font-medium ${feedback.ok ? 'text-emerald-600' : 'text-red-600'}`}
            role="status"
          >
            {feedback.text}
          </span>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {DAY_LABELS.map(({ value, label }) => {
            const active = value === activeDayOfWeek
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveDayOfWeek(value)}
                className={[
                  'px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {(() => {
          const activeLabel = DAY_LABELS.find((d) => d.value === activeDayOfWeek)?.label ?? ''
          const day_of_week = activeDayOfWeek
          return (
            <section key={day_of_week} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">曜日: {activeLabel}</h2>
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
                      className={cn(
                        'flex-1 max-w-xs border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                        currentId === BLOCKED_STUDENT_ID
                          ? 'bg-gray-100 border-gray-300 text-gray-500 opacity-80 focus:ring-gray-200'
                          : currentId
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-800 focus:ring-indigo-200'
                            : 'bg-white border-gray-200 text-gray-900 focus:ring-indigo-200'
                      )}
                      >
                        <option value="">未割り当て（空き）</option>
                      <option value={BLOCKED_STUDENT_ID}>不可</option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })()}
      </div>
    </div>
  )
}
