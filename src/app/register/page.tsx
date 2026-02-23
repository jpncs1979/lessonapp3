'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import { registerCredentials, isRegistered } from '@/lib/auth'
import { getRoleLabel } from '@/lib/utils'
import Button from '@/components/ui/Button'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const users = state.users

  const [selectedUserId, setSelectedUserId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const alreadyRegistered = selectedUserId ? isRegistered(selectedUserId) : false

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedUser) {
      setError('名前を選択してください')
      return
    }
    if (alreadyRegistered) {
      setError('このアカウントは登録済みです。ログイン画面からログインしてください。')
      return
    }
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
          <p className="text-sm text-gray-500 mt-1">初回登録</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">名前を選択し、メールとパスワードを設定</h2>
          <p className="text-xs text-gray-500 mb-4">
            先生が名簿に登録した方のみ登録できます。初回のみこの画面で設定してください。
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
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                このアカウントは登録済みです。
                <Link href="/login" className="block mt-2 text-indigo-600 font-medium hover:underline">
                  ログイン画面へ →
                </Link>
              </div>
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
                {loading ? '登録中...' : '登録してログイン'}
              </Button>
            )}
          </form>
        </div>

        <p className="text-center mt-4">
          <Link href="/login" className="text-sm text-indigo-600 hover:underline">
            すでに登録済みの方はログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
