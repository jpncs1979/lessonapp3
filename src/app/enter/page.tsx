'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import { getRoleLabel } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchAppUsers, fetchFullState } from '@/lib/supabase/sync'
import { NAME_ONLY_USER_KEY } from '@/lib/store'
import type { User } from '@/types'

export default function EnterPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const supabase = createSupabaseClient()

  const [nameList, setNameList] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')

  const selectedUser = nameList.find((u) => u.id === selectedUserId)

  // 名簿の生徒・伴奏者を表示（先生は含めない）
  useEffect(() => {
    setLoadError(false)
    if (!supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      setLoadError(true)
      setLoading(false)
    }, 10000)
    fetchAppUsers(supabase)
      .then((users) => {
        if (cancelled) return
        setNameList(users.filter((u) => u.role === 'student' || u.role === 'accompanist'))
      })
      .catch(() => {
        if (!cancelled) {
          setNameList([])
          setLoadError(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [supabase])

  // すでにログイン済みならカレンダーへ
  useEffect(() => {
    if (state.currentUser) router.push('/calendar')
  }, [state.currentUser, router])

  const handleEnterClick = async () => {
    if (!selectedUser || !supabase) return
    dispatch({ type: 'LOGIN', payload: selectedUser })
    try {
      localStorage.setItem(NAME_ONLY_USER_KEY, JSON.stringify({
        id: selectedUser.id,
        name: selectedUser.name,
        role: selectedUser.role,
      }))
    } catch { /* ignore */ }
    const full = await fetchFullState(supabase)
    if (full) dispatch({ type: 'MERGE_REMOTE_STATE', payload: full })
    router.push('/calendar')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <Music size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">名前を選択して入る</h1>
          <p className="text-sm text-gray-500 mt-1">生徒・伴奏者は名簿に名前があれば、名前を選ぶだけで入れます（アカウント登録不要）</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">あなたの名前</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">選択してください</option>
                    {nameList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}（{getRoleLabel(u.role)}）
                      </option>
                    ))}
                  </select>
                  {nameList.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {loadError
                        ? '名簿を取得できませんでした。通信を確認するか、しばらくして最初の画面からやり直してください。'
                        : '名簿に生徒・伴奏者がいません。先生が名簿に追加してください。'}
                    </p>
                  )}
                </div>

                {selectedUserId && (
                  <Button type="button" className="w-full" onClick={handleEnterClick}>
                    この名前で入る
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-center mt-4">
          <Link href="/" className="text-sm text-gray-500 hover:underline">最初の画面に戻る</Link>
        </p>
      </div>
    </div>
  )
}
