'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import { validateLogin, isEmailConfirmed } from '@/lib/auth'
import Button from '@/components/ui/Button'
import { createSupabaseClient } from '@/lib/supabase/client'
import { signInWithSupabase } from '@/lib/supabase/sync'

export default function LoginPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const supabase = createSupabaseClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameOnlyUserId, setNameOnlyUserId] = useState('')

  const students = state.users.filter((u) => u.role === 'student')
  const studentsWithConfirmed = students.filter((s) => isEmailConfirmed(s.id))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const emailTrim = email.trim()
    if (!emailTrim || !password) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }

    setLoading(true)
    try {
      if (supabase) {
        const { user: appUser, error: signInError } = await signInWithSupabase(supabase, emailTrim, password)
        if (signInError) {
          setError(signInError.message || 'メールアドレスまたはパスワードが正しくありません')
          setLoading(false)
          return
        }
        if (appUser) dispatch({ type: 'LOGIN', payload: appUser })
        router.push('/calendar')
        return
      }
      const userId = await validateLogin(emailTrim, password)
      if (!userId) {
        setError('メールアドレスまたはパスワードが正しくありません')
        setLoading(false)
        return
      }
      const user = state.users.find((u) => u.id === userId)
      if (!user) {
        setError('このアカウントは名簿に登録されていません。先生にお問い合わせください。')
        setLoading(false)
        return
      }
      dispatch({ type: 'LOGIN', payload: user })
      router.push('/calendar')
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  const handleNameOnlyLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!nameOnlyUserId) {
      setError('名前を選択してください')
      return
    }
    const user = state.users.find((u) => u.id === nameOnlyUserId)
    if (!user || user.role !== 'student') {
      setError('選択したアカウントでログインできません')
      return
    }
    if (!isEmailConfirmed(nameOnlyUserId)) {
      setError('このアカウントはまだメールアドレス確認が済んでいません。はじめにメール・パスワードでログインしてください。')
      return
    }
    dispatch({ type: 'LOGIN', payload: user })
    router.push('/calendar')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
            <Music size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">レッスンスケジューラー</h1>
          <p className="text-sm text-gray-500 mt-1">先生が登録した方のみログインできます</p>
        </div>

        {/* 生徒：名前選択だけでログイン（Supabase 未使用時のみ・アドレス確認済み） */}
        {!supabase && studentsWithConfirmed.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-1">生徒の方は名前でログイン</h2>
            <p className="text-xs text-gray-500 mb-4">メールアドレス確認済みの方は名前を選ぶだけで入れます</p>
            <form onSubmit={handleNameOnlyLogin} className="space-y-3">
              <select
                value={nameOnlyUserId}
                onChange={(e) => { setNameOnlyUserId(e.target.value); setError('') }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">名前を選択</option>
                {studentsWithConfirmed.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button type="submit" className="w-full">
                名前でログイン
              </Button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">メール・パスワードでログイン</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="登録したメールアドレス"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="パスワード"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
          </form>
        </div>

        <p className="text-center mt-4">
          <Link href="/register" className="text-sm text-indigo-600 hover:underline">
            名前を選択して入る / 登録
          </Link>
        </p>
      </div>
    </div>
  )
}
