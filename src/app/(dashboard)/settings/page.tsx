'use client'

import Link from 'next/link'
import { Users, UserPlus, CalendarDays, CalendarSync, History, ClipboardList } from 'lucide-react'
import { useApp } from '@/lib/store'
import { getTeacherGroupLabel } from '@/lib/utils'

export default function SettingsPage() {
  const { state } = useApp()
  const { currentUser } = state

  if (!currentUser || currentUser.role !== 'teacher') {
    return <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
  }

  const { students, accompanists } = state

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">設定</h1>
      <p className="text-sm text-gray-500 mb-5">
        {getTeacherGroupLabel(currentUser.name)}向けの管理メニューです。終了時間・昼休み・デフォルト教室など、日ごとの内容はスケジュールの
        <span className="font-medium text-gray-700"> 1日表示</span>（週表示の各日「設定」から）で編集できます。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/roster"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <UserPlus size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">名簿管理</p>
            <p className="text-xs text-gray-500">学生・伴奏者の追加・編集・削除</p>
          </div>
        </Link>
        <Link
          href="/settings/weekly-master"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <CalendarDays size={20} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">週間マスター</p>
            <p className="text-xs text-gray-500">曜日・時間枠ごとの受講生テンプレート</p>
          </div>
        </Link>
        <Link
          href="/settings/google-calendar"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors sm:col-span-2"
        >
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
            <CalendarSync size={20} className="text-sky-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Google カレンダー同期</p>
            <p className="text-xs text-gray-500">OAuth で連携し、予約済みのレッスンを反映</p>
          </div>
        </Link>
        <Link
          href="/settings/login-history"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors sm:col-span-2"
        >
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <History size={20} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">ログイン履歴</p>
            <p className="text-xs text-gray-500">先生・生徒・伴奏者の最終ログイン時刻を確認</p>
          </div>
        </Link>
        <Link
          href="/settings/lesson-history"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors sm:col-span-2"
        >
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
            <ClipboardList size={20} className="text-rose-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">レッスン変更履歴</p>
            <p className="text-xs text-gray-500">枠の追加・更新・削除を DB で記録（いつ・誰が操作したかの追跡）</p>
          </div>
        </Link>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <Users size={15} />
          登録状況
        </h2>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>生徒 {students.length}名</span>
          <span>伴奏者 {accompanists.length}名</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">詳細は名簿管理で編集できます</p>
      </div>
    </div>
  )
}
