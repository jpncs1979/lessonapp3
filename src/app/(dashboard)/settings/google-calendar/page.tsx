'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarSync, Link2, Unplug, Loader2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import Button from '@/components/ui/Button'

type StatusRes = {
  ok: boolean
  connected?: boolean
  calendarId?: string | null
  updatedAt?: string | null
  reason?: 'no_supabase' | 'not_teacher' | string
}

export default function GoogleCalendarSettingsPage() {
  const { state } = useApp()
  const { currentUser } = state
  const [status, setStatus] = useState<StatusRes | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/google-calendar/status', { credentials: 'include' })
      const j = (await r.json()) as StatusRes
      setStatus(j)
    } catch {
      setStatus({ ok: false, connected: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const g = params.get('google')
    const msg = params.get('msg')
    if (!g) return
    if (g === 'connected') {
      setToast({ ok: true, text: 'Google カレンダーと連携しました。必要なら「今すぐ同期」を押してください。' })
      void loadStatus()
    } else if (g === 'error') {
      setToast({
        ok: false,
        text: msg ? decodeURIComponent(msg) : '連携に失敗しました',
      })
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('google')
    url.searchParams.delete('msg')
    window.history.replaceState({}, '', url.pathname + url.search)
  }, [loadStatus])

  const handleSync = async () => {
    setSyncing(true)
    setToast(null)
    try {
      const r = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const j = (await r.json()) as {
        ok: boolean
        created?: number
        updated?: number
        deleted?: number
        errors?: string[]
        error?: string
      }
      if (!r.ok || !j.ok) {
        setToast({ ok: false, text: j.error ?? j.errors?.join(' ') ?? '同期に失敗しました' })
        return
      }
      const parts = [
        j.created ? `新規 ${j.created}` : '',
        j.updated ? `更新 ${j.updated}` : '',
        j.deleted ? `削除 ${j.deleted}` : '',
      ].filter(Boolean)
      const base =
        parts.length > 0
          ? `同期しました（${parts.join(' / ')}）`
          : '同期しました（対象の予定はありませんでした）'
      if (j.errors?.length) {
        setToast({ ok: false, text: `${base} — エラー: ${j.errors.join('; ')}` })
      } else {
        setToast({ ok: true, text: base })
      }
    } catch (e) {
      setToast({ ok: false, text: e instanceof Error ? e.message : '同期に失敗しました' })
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Google カレンダー連携を解除します。同期済みのイベントはできるだけ削除します。よろしいですか？')) return
    setDisconnecting(true)
    setToast(null)
    try {
      const r = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      })
      const j = (await r.json()) as { ok: boolean; error?: string }
      if (!r.ok || !j.ok) {
        setToast({ ok: false, text: j.error ?? '解除に失敗しました' })
        return
      }
      setToast({ ok: true, text: '連携を解除しました' })
      await loadStatus()
    } catch (e) {
      setToast({ ok: false, text: e instanceof Error ? e.message : '解除に失敗しました' })
    } finally {
      setDisconnecting(false)
    }
  }

  if (!currentUser || currentUser.role !== 'teacher') {
    return <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
  }

  const noSupabase = status?.reason === 'no_supabase'

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/settings" className="text-sm text-indigo-600 hover:underline">
          ← 設定に戻る
        </Link>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Google カレンダー同期</h1>
      <p className="text-sm text-gray-500 mb-6">
        確定・承認待ちのレッスン（生徒が紐づいている枠）を、お使いの Google カレンダーに反映します。
      </p>

      {noSupabase && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase が無効な構成では、この連携は利用できません（サーバー側でログイン状態が必要です）。
        </div>
      )}

      {toast && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            toast.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
            <CalendarSync size={20} className="text-sky-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">連携状態</p>
            {loading ? (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                確認中…
              </p>
            ) : status?.connected ? (
              <p className="text-xs text-emerald-700 mt-1">
                連携済み（カレンダー: {status.calendarId ?? 'primary'}）
                {status.updatedAt && (
                  <span className="block text-gray-500 mt-0.5">
                    トークン更新: {new Date(status.updatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">未連携です。下のボタンから Google にログインして許可してください。</p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="primary"
            className="gap-2"
            disabled={loading || noSupabase}
            onClick={() => {
              window.location.href = '/api/google-calendar/connect'
            }}
          >
            <Link2 size={16} aria-hidden />
            {status?.connected ? 'Google と再連携（トークン更新）' : 'Google と連携する'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={noSupabase || !status?.connected || syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                同期中…
              </>
            ) : (
              <>
                <CalendarSync size={16} aria-hidden />
                今すぐ同期
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="gap-2 text-red-700 border-red-100 hover:bg-red-50"
            disabled={noSupabase || !status?.connected || disconnecting}
            onClick={() => void handleDisconnect()}
          >
            {disconnecting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Unplug size={16} aria-hidden />
            )}
            連携解除
          </Button>
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-500 space-y-2 leading-relaxed">
        <p className="font-medium text-gray-700">事前準備（Google Cloud）</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Google Cloud コンソールでプロジェクトを作成し、Google Calendar API を有効にする</li>
          <li>
            OAuth クライアント ID（ウェブアプリ）を作成し、承認済みのリダイレクト URI に{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">
              （サイトのオリジン）/api/google-calendar/callback
            </code>{' '}
            を追加する
          </li>
          <li>
            環境変数に{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">GOOGLE_CLIENT_ID</code>・
            <code className="text-[11px] bg-gray-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code>・
            <code className="text-[11px] bg-gray-100 px-1 rounded">GOOGLE_REDIRECT_URI</code>（本番は固定 URL 推奨）または{' '}
            <code className="text-[11px] bg-gray-100 px-1 rounded">NEXT_PUBLIC_APP_URL</code>
            を設定する
          </li>
          <li>Supabase にマイグレーション `20250411120000_teacher_google_calendar.sql` を適用する</li>
        </ol>
      </div>
    </div>
  )
}
