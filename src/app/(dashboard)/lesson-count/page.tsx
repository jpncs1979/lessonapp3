'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useApp } from '@/lib/store'
import LessonSummary from '@/components/calendar/LessonSummary'
import { createSupabaseClient } from '@/lib/supabase/client'
import { getAppUserFromSession } from '@/lib/supabase/sync'

/** 現在の年度（4/1〜翌3/31）の開始日・終了日 */
function getAcademicYearRange(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 4) {
    return { start: `${year}-04-01`, end: `${year + 1}-03-31` }
  }
  return { start: `${year - 1}-04-01`, end: `${year}-03-31` }
}

export default function LessonCountPage() {
  const { state } = useApp()
  const { currentUser, lessons } = state

  /** 生徒の場合のみ: メール・パスワードでログイン済みか（本人確認済みか） */
  const [studentVerified, setStudentVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      setStudentVerified(null)
      return
    }
    const supabase = createSupabaseClient()
    if (!supabase) {
      setStudentVerified(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const sessionUser = await getAppUserFromSession(supabase)
      if (cancelled) return
      setStudentVerified(sessionUser?.id === currentUser.id)
    })()
    return () => { cancelled = true }
  }, [currentUser?.id, currentUser?.role])

  if (!currentUser) return null

  const now = new Date()
  const thisMonth = now.toISOString().slice(0, 7)
  const { start: yearStart, end: yearEnd } = getAcademicYearRange()

  const relevant = lessons.filter((l) => l.status === 'confirmed' || l.status === 'pending')

  const isStudent = currentUser.role === 'student'
  const isAccompanist = currentUser.role === 'accompanist'
  const isTeacher = currentUser.role === 'teacher'

  let countThisMonth = 0
  let countYear = 0

  if (isStudent) {
    countThisMonth = relevant.filter((l) => l.studentId === currentUser.id && l.date.startsWith(thisMonth)).length
    countYear = relevant.filter(
      (l) => l.studentId === currentUser.id && l.date >= yearStart && l.date <= yearEnd
    ).length
  } else if (isAccompanist) {
    countThisMonth = relevant.filter((l) => l.accompanistId === currentUser.id && l.date.startsWith(thisMonth)).length
    countYear = relevant.filter(
      (l) => l.accompanistId === currentUser.id && l.date >= yearStart && l.date <= yearEnd
    ).length
  }

  const yearLabel = yearStart.slice(0, 4) + '年4月〜' + yearEnd.slice(0, 4) + '年3月'

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">{currentUser.name}さんのレッスン回数</h1>
      <p className="text-sm text-gray-500 mb-6">今月と年度累計の回数です</p>

      {isTeacher ? (
        <LessonSummary />
      ) : isAccompanist ? (
        <p className="text-gray-500">伴奏者用のレッスン回数カウントはありません。カレンダーで担当日の確認ができます。</p>
      ) : studentVerified === null ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : !studentVerified ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-sm text-amber-800 mb-4">
            レッスン回数を表示するには、本人確認のためメールとパスワードでログインしてください。
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition"
          >
            メール・パスワードでログイン
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-1">今月のレッスン回数</h2>
            <p className="text-3xl font-bold text-indigo-600">{countThisMonth}<span className="text-lg font-normal text-gray-500 ml-1">回</span></p>
            <p className="text-xs text-gray-400 mt-1">{thisMonth.replace('-', '年')}月</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-1">累計のレッスン回数</h2>
            <p className="text-3xl font-bold text-indigo-600">{countYear}<span className="text-lg font-normal text-gray-500 ml-1">回</span></p>
            <p className="text-xs text-gray-400 mt-1">{yearLabel}（4月1日〜翌3月31日でリセット）</p>
          </div>
        </div>
      )}
    </div>
  )
}
