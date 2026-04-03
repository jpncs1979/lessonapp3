'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Check, Save } from 'lucide-react'
import { useApp, makeDefaultDaySettings } from '@/lib/store'
import { createSupabaseClient } from '@/lib/supabase/client'
import { persistState, persistWeeklyMasters } from '@/lib/supabase/sync'
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
  const [saveNonce, setSaveNonce] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

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

  /** 週間マスター行だけ Supabase に保存（再ログインで復元されるのはここ） */
  const handleSaveServer = async () => {
    const next = buildMastersFromLocalMap(localMap)
    dispatch({ type: 'REPLACE_WEEKLY_MASTERS', payload: next })
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
      setFeedback({ ok: true, text: 'サーバーに保存しました（再ログイン後もこの内容が読み込まれます）' })
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
    setFeedback({ ok: true, text: 'カレンダーに反映しました。数秒以内にサーバーへ同期されます' })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">週間マスター</h1>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        曜日・時間枠ごとに「この時間は誰が受けるか」のテンプレートを設定します。
        未割り当ては「空き（available）」、不可は「レッスン不可（blocked）」、学生割当は「授業あり（confirmed）」になります。
      </p>
      <div className="text-xs text-gray-500 mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
        <p>
          <span className="font-medium text-gray-700">保存の仕組み：</span>
          週間マスターは Supabase のデータベース（<code className="text-[11px] bg-white px-1 rounded">weekly_masters</code> テーブル）に保存されます。
          ログインするとサーバーから読み込み、画面に表示されます。
        </p>
        <p>
          <span className="font-medium text-gray-700">「保存」</span>
          はテンプレートだけをサーバーに書き込みます（その日のカレンダー枠はまだ変えません）。
          <span className="font-medium text-gray-700">「カレンダーに反映」</span>
          は今日以降のレッスン枠をテンプレに合わせて作り直し、あわせて全体をサーバーに同期します。
        </p>
        <p className="text-amber-800/90">
          再ログインで内容が戻る・別の状態に見える場合は、「保存」が失敗している（エラー表示）か、別の Supabase プロジェクト／ブラウザプロファイルを見ている可能性があります。
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className="gap-1.5"
          disabled={saving}
          onClick={() => void handleSaveServer()}
        >
          <Save size={16} />
          {saving ? '保存中…' : '保存（サーバー）'}
        </Button>
        <Button type="button" onClick={handleApplyToCalendar} className="gap-1.5">
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
                      <option value="">未割り当て（空き）</option>
                      <option value={BLOCKED_STUDENT_ID}>不可（レッスン不可）</option>
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
