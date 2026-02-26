'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'
import Button from '@/components/ui/Button'
import { createSupabaseClient } from '@/lib/supabase/client'
import { getAppUserFromSession, signInWithSupabase } from '@/lib/supabase/sync'

export default function TeacherLoginPage() {
  const router = useRouter()
  const { state, dispatch } = useApp()
  const supabase = createSupabaseClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (state.currentUser) {
      if (state.currentUser.role === 'teacher') {
        router.push('/calendar')
      }
    } else if (supabase) {
      getAppUserFromSession(supabase).then((user) => {
        if (user?.role === 'teacher') {
          dispatch({ type: 'LOGIN', payload: user })
          router.push('/calendar')
        }
      })
    }
  }, [state.currentUser, supabase, dispatch, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const emailTrim = email.trim()
    if (!emailTrim || !password) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }
    if (!supabase) {
      setError('ログイン機能は利用できません。')
      return
    }
    setLoading(true)
    try {
      const timeoutMs = 15000
      const result = await Promise.race([
        signInWithSupabase(supabase, emailTrim, password),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('タイムアウト')), timeoutMs)
        ),
      ])
      const { user: appUser, error: signInError } = result
      if (signInError) {
        setError(signInError.message || 'メールアドレスまたはパスワードが正しくありません')
        setLoading(false)
        return
      }
      if (appUser) {
        if (appUser.role !== 'teacher') {
          setError('先生用のログインです。生徒・伴奏者は「名前を選択して入る」から入ってください。')
          setLoading(false)
          return
        }
        dispatch({ type: 'LOGIN', payload: appUser })
        router.push('/calendar')
      }
    } catch (err) {
      setError(err instanceof Error && err.message === 'タイムアウト'
        ? '接続がタイムアウトしました。通信を確認して再度お試しください。'
        : 'ログインに失敗しました。')
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
          <h1 className="text-2xl font-bold text-gray-900">先生ログイン</h1>
          <p className="text-sm text-gray-500 mt-1">メールアドレスとパスワードを入力してください</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
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
          <Link href="/" className="text-sm text-gray-500 hover:underline">最初の画面に戻る</Link>
        </p>
      </div>
    </div>
  )
}
