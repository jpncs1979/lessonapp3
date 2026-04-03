'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useApp } from '@/lib/store'
import { getTeacherGroupLabel, cn } from '@/lib/utils'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import Button from '@/components/ui/Button'

function formatSyncedAt(d: Date) {
  return d.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CalendarPage() {
  const { state, refreshFromServer } = useApp()
  const { currentUser } = state
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [syncHint, setSyncHint] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!syncHint) return
    const t = setTimeout(() => setSyncHint(null), 3500)
    return () => clearTimeout(t)
  }, [syncHint])

  const handleRefresh = useCallback(async () => {
    setSyncing(true)
    setSyncHint(null)
    try {
      const r = await refreshFromServer()
      if (r.ok) {
        setLastSyncedAt(new Date())
        setSyncHint({ ok: true, text: 'サーバーと同じ最新表示にしました' })
      } else {
        setSyncHint({ ok: false, text: r.message ?? '取得に失敗しました' })
      }
    } catch (e) {
      setSyncHint({
        ok: false,
        text: e instanceof Error ? e.message : '取得に失敗しました',
      })
    } finally {
      setSyncing(false)
    }
  }, [refreshFromServer])

  if (!currentUser) return null

  const isTeacher = currentUser.role === 'teacher'
  const isAccompanist = currentUser.role === 'accompanist'

  const title =
    isTeacher ? `${getTeacherGroupLabel(currentUser.name)} レッスン実施スケジュール`
    : isAccompanist ? `${currentUser.name}さん 伴奏付きレッスン一覧`
    : `${currentUser.name}さんの予約状況`

  const description =
    isTeacher
      ? '門下生全体の予約状況（個人/伴奏付き）の把握、各学生の受講回数'
      : isAccompanist
        ? '可能枠の設定、担当する伴奏付きレッスンの確定状況、自分が「可能」と提示している枠の確認'
        : 'レッスン可の枠の確認、自分の予約済みレッスン、個人レッスンまたは伴奏付きレッスンの予約'

  return (
    <div className="min-h-0 flex flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 mb-2 sm:mb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl font-bold text-gray-900 mb-0.5 sm:mb-1 truncate">{title}</h1>
          <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 sm:line-clamp-none">{description}</p>
        </div>
        <div className="flex flex-col gap-1 shrink-0 sm:items-end sm:pt-0.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto gap-1.5"
            disabled={syncing}
            onClick={handleRefresh}
            aria-busy={syncing}
          >
            <RefreshCw size={15} className={cn(syncing && 'animate-spin')} aria-hidden />
            {syncing ? '取得中…' : '最新を取得'}
          </Button>
          {lastSyncedAt && (
            <p className="text-[11px] sm:text-xs text-gray-400 sm:text-right">
              最終取得: {formatSyncedAt(lastSyncedAt)}
            </p>
          )}
          {syncHint && (
            <p
              className={cn(
                'text-[11px] sm:text-xs sm:text-right',
                syncHint.ok ? 'text-emerald-700' : 'text-red-600'
              )}
              role="status"
            >
              {syncHint.text}
            </p>
          )}
          <p className="text-[11px] text-gray-400 sm:text-right hidden sm:block">
            PC とスマホで見る場合、ここで揃えられます。
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-2 sm:mb-4 sm:hidden">
        別端末で変更したあとは「最新を取得」で表示を合わせられます。
      </p>
      <p className="text-xs text-gray-400 mb-2 sm:mb-4 hidden sm:block">
        日付をタップすると、その日のスケジュール（時間割）に移動します。
      </p>

      <div className="min-h-0 flex-1 flex flex-col">
        <MonthCalendar />
      </div>
    </div>
  )
}
