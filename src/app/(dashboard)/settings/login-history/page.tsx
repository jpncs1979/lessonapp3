'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useApp } from '@/lib/store'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchAllLoginHistory, type LoginHistoryRow } from '@/lib/supabase/sync'
import Button from '@/components/ui/Button'

function formatDateTime(value: string | null): string {
  if (!value) return '未ログイン'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '不明'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const ROLE_LABEL: Record<LoginHistoryRow['role'], string> = {
  teacher: '先生',
  student: '生徒',
  accompanist: '伴奏者',
}

export default function LoginHistoryPage() {
  const { state } = useApp()
  const { currentUser } = state
  const supabase = createSupabaseClient()
  const [rows, setRows] = useState<LoginHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const at = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
        const bt = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
        return bt - at
      }),
    [rows]
  )

  const load = async () => {
    if (!supabase) {
      setError('Supabase が未設定のため取得できません。')
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await fetchAllLoginHistory(supabase)
    if (fetchError) {
      setError(fetchError.message || 'ログイン履歴の取得に失敗しました。')
      setRows([])
      setLoading(false)
      return
    }
    setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

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
          <h1 className="text-xl font-bold text-gray-900">ログイン履歴</h1>
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
        先生・生徒・伴奏者の最終ログイン時刻を表示します。
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">名前</th>
              <th className="text-left px-4 py-3 font-medium">区分</th>
              <th className="text-left px-4 py-3 font-medium">メール</th>
              <th className="text-left px-4 py-3 font-medium">最終ログイン</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-gray-500">
                  取得中...
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-gray-500">
                  ログイン履歴がありません。
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.app_user_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-700">{ROLE_LABEL[row.role]}</td>
                  <td className="px-4 py-3 text-gray-700">{row.email ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDateTime(row.last_sign_in_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
