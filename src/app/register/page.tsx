'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import { registerCredentials, isRegistered } from '@/lib/auth'
import { getRoleLabel } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { createSupabaseClient } from '@/lib/supabase/client'
import { registerWithSupabase, isAppUserRegistered, getAppUserFromSession } from '@/lib/supabase/sync'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const users = state.users
  const supabase = createSupabaseClient()

  const [selectedUserId, setSelectedUserId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [checkingRegistered, setCheckingRegistered] = useState(false)

  const selectedUser = users.find((u) => u.id === selectedUserId)

  useEffect(() => {
    if (!selectedUserId) {
      setAlreadyRegistered(false)
      return
    }
    if (supabase) {
      setCheckingRegistered(true)
      isAppUserRegistered(supabase, selectedUserId).then((v) => {
        setAlreadyRegistered(v)
        setCheckingRegistered(false)
      })
    } else {
      setAlreadyRegistered(isRegistered(selectedUserId))
    }
  }, [selectedUserId, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedUser) {
      setError('名前を選択してください')
      return
    }
    if (alreadyRegistered) return
    const emailTrim = email.trim()
    if (!emailTrim) {
      setError('メールアドレスを入力してください')
      return
    }
    if (!EMAIL_RE.test(emailTrim)) {
      setError('有効なメールアドレスを入力してください')
      return
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください')
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      if (supabase) {
        const { error: err } = await registerWithSupabase(supabase, selectedUser.id, emailTrim, password)
        if (err) {
          setError(err.message || '登録に失敗しました。もう一度お試しください。')
          setLoading(false)
          return
        }
        router.push('/calendar')
        return
      }
      await registerCredentials(selectedUser.id, emailTrim, password)
      dispatch({ type: 'UPDATE_USER_EMAIL', payload: { id: selectedUser.id, email: emailTrim } })
      dispatch({ type: 'LOGIN', payload: { ...selectedUser, email: emailTrim } })
      router.push('/calendar')
    } catch {
      setError('登録に失敗しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <Music size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">レッスンスケジューラー</h1>
          <p className="text-sm text-gray-500 mt-1">名前を選択して入る</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-2">名前を選択</h2>
          <p className="text-xs text-gray-500 mb-4">
            登録がない場合はメール・パスワードを設定して登録。すでに登録済みの場合はそのまま入れます。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">あなたの名前</label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value)
                  setError('')
                }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required
              >
                <option value="">選択してください</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}（{getRoleLabel(u.role)}）
                  </option>
                ))}
              </select>
              {users.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">名簿に誰も登録されていません。先生が名簿管理で追加してください。</p>
              )}
            </div>

            {selectedUserId && alreadyRegistered && (
              <>
                {supabase ? (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      className="w-full"
                      onClick={async () => {
                        if (!selectedUser) return
                        const current = await getAppUserFromSession(supabase)
                        if (current?.id === selectedUser.id) {
                          dispatch({ type: 'LOGIN', payload: current })
                          router.push('/calendar')
                        } else {
                          router.push('/login')
                        }
                      }}
                    >
                      ログイン
                    </Button>
                    <p className="text-xs text-gray-500 text-center">
                      この端末でログイン済みならそのまま入ります。未ログインの場合はメール・パスワード画面へ進みます。
                    </p>
                  </div>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      if (selectedUser) {
                        dispatch({ type: 'LOGIN', payload: selectedUser })
                        router.push('/calendar')
                      }
                    }}
                  >
                    ログイン
                  </Button>
                )}
              </>
            )}

            {selectedUserId && !alreadyRegistered && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    placeholder="example@email.com"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（6文字以上）</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（確認）</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {selectedUserId && !alreadyRegistered && (
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '登録中...' : '登録する'}
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
