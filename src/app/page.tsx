'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Music } from 'lucide-react'
import { useApp } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const { state } = useApp()

  useEffect(() => {
    if (!state.sessionRestoreDone) return
    if (state.currentUser) {
      router.push('/calendar')
    }
  }, [state.sessionRestoreDone, state.currentUser, router])

  if (!state.sessionRestoreDone) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (state.currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg mb-4">
          <Music size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">大和田門下レッスン</h1>
        <p className="text-sm text-gray-500 mb-8">生徒・伴奏者は名前を選択。先生はログイン。</p>

        <div className="space-y-3">
          <Link
            href="/enter"
            className="block w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition"
          >
            名前を選択して入る
          </Link>
          <Link
            href="/teacher-login"
            className="block w-full py-3 px-4 bg-white border-2 border-indigo-600 text-indigo-700 font-medium rounded-xl hover:bg-indigo-50 transition"
          >
            先生ログイン
          </Link>
        </div>
      </div>
    </div>
  )
}
