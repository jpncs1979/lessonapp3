'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useApp } from '@/lib/store'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchLessonChangeLog, type LessonChangeLogRow } from '@/lib/supabase/sync'
import Button from '@/components/ui/Button'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '不明'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function opLabel(op: LessonChangeLogRow['op']): string {
  switch (op) {
    case 'INSERT':
      return '追加'
    case 'UPDATE':
      return '更新'
    case 'DELETE':
      return '削除'
    default:
      return op
  }
}

function rowSummary(row: LessonChangeLogRow): string {
  const snap = row.op === 'DELETE' ? row.old_row : row.new_row
  if (!snap || typeof snap !== 'object') return '—'
  const date = typeof snap.date === 'string' ? snap.date : ''
  const st = typeof snap.start_time === 'string' ? snap.start_time : ''
  const et = typeof snap.end_time === 'string' ? snap.end_time : ''
  const room = typeof snap.room_name === 'string' ? snap.room_name : ''
  return [date, st && et ? `${st}–${et}` : st, room].filter(Boolean).join(' / ') || '—'
}

function actorLabel(row: LessonChangeLogRow): string {
  if (row.actor_name) {
    const id = row.actor_app_user_id ? ` (${row.actor_app_user_id})` : ''
    return `${row.actor_name}${id}`
  }
  if (row.auth_uid) return `認証UIDのみ (${row.auth_uid.slice(0, 8)}…)`
  return '未ログイン（anon・名前のみ入場など）'
}

export default function LessonHistoryPage() {
  const { state } = useApp()
  const { currentUser } = state
  const supabase = createSupabaseClient()
  const [rows, setRows] = useState<LessonChangeLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sortedRows = useMemo(() => [...rows], [rows])

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Supabase が未設定のため取得できません。')
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await fetchLessonChangeLog(supabase, 800)
    if (fetchError) {
      setError(fetchError.message || '履歴の取得に失敗しました。')
      setRows([])
      setLoading(false)
      return
    }
    setRows(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentUser || currentUser.role !== 'teacher') {
    return <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft size={20} className="text-gray-600" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">レッスン変更履歴</h1>
        </div>
        <Button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5"
        >
          <RefreshCw size={14} />
          更新
        </Button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        データベース上の <span className="font-medium text-gray-700">lessons</span> テーブルへの追加・更新・削除を時系列で記録しています。
        操作者は Supabase Auth にログインしている場合のみ紐付きます。名前のみで入場した操作は「未ログイン」と表示されます。
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">日時</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">操作</th>
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">レッスンID</th>
              <th className="text-left px-4 py-3 font-medium">内容（日付・時間・教室）</th>
              <th className="text-left px-4 py-3 font-medium">操作者</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-gray-500">
                  取得中...
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-gray-500">
                  履歴がありません。マイグレーション適用後、レッスンを変更するとここに記録されます。
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 text-gray-800 whitespace-nowrap">{formatDateTime(r.occurred_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={
                        r.op === 'DELETE'
                          ? 'text-red-700 font-medium'
                          : r.op === 'INSERT'
                            ? 'text-emerald-700 font-medium'
                            : 'text-amber-800 font-medium'
                      }
                    >
                      {opLabel(r.op)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 break-all max-w-[140px]">{r.lesson_id}</td>
                  <td className="px-4 py-3 text-gray-700">{rowSummary(r)}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{actorLabel(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
