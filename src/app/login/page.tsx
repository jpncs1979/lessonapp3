'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import { validateLogin } from '@/lib/auth'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">ログイン</h2>

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
            初回の方はこちら（名前選択でメール・パスワードを設定）
          </Link>
        </p>
      </div>
    </div>
  )
}
