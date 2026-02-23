'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Settings, LogOut, Music, BarChart3 } from 'lucide-react'
import { useApp } from '@/lib/store'
import { cn, getRoleLabel, getRoleColor, getInitials } from '@/lib/utils'

export default function Sidebar() {
  const pathname = usePathname()
  const { state, dispatch } = useApp()
  const { currentUser } = state

  if (!currentUser) return null

  const isTeacher = currentUser.role === 'teacher'

  const allNavItems = [
    { href: '/calendar', icon: Calendar, label: 'カレンダー' },
    { href: '/lesson-count', icon: BarChart3, label: `${currentUser.name}さんのレッスン回数` },
    ...(isTeacher ? [{ href: '/settings', icon: Settings, label: '設定' }] : []),
  ]

  return (
    <>
      {/* デスクトップサイドバー */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-200 fixed left-0 top-0 z-40">
        {/* ロゴ */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Music size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm leading-tight">レッスン<br />スケジューラー</span>
          </div>
        </div>

        {/* ナビ */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {allNavItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* ユーザー情報 */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
              {getInitials(currentUser.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{currentUser.name}</p>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', getRoleColor(currentUser.role))}>
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
          </div>
          <button
            onClick={async () => {
              const supabase = (await import('@/lib/supabase/client')).createSupabaseClient()
              if (supabase) (await import('@/lib/supabase/sync')).signOutSupabase(supabase)
              dispatch({ type: 'LOGOUT' })
            }}
            className="mt-1 flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            ログアウト
          </button>
        </div>
      </aside>

      {/* モバイル下部ナビ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex">
        {allNavItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors',
                active ? 'text-indigo-600' : 'text-gray-500'
              )}
            >
              <item.icon size={20} className="mb-0.5" />
              {item.label}
            </Link>
          )
        })}
        <button
          onClick={async () => {
            const supabase = (await import('@/lib/supabase/client')).createSupabaseClient()
            if (supabase) (await import('@/lib/supabase/sync')).signOutSupabase(supabase)
            dispatch({ type: 'LOGOUT' })
          }}
          className="flex-1 flex flex-col items-center py-2 text-xs font-medium text-gray-500"
        >
          <LogOut size={20} className="mb-0.5" />
          ログアウト
        </button>
      </nav>
    </>
  )
}
