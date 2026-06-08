'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Cloud, CloudOff, Loader2, CalendarSync } from 'lucide-react'
import { useApp } from '@/lib/store'
import {
  readGoogleCalendarSyncSnapshot,
  clearGoogleCalendarSyncSnapshot,
  clearOrphanedRunningSnapshot,
  type GoogleCalendarSyncSnapshot,
} from '@/lib/google-calendar/client-sync'
import { cn } from '@/lib/utils'

const GCAL_RESULT_AUTO_DISMISS_MS = 8000

function formatSavedAt(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SyncStatusBar() {
  const { persistUi, dismissPersistSaved, dismissGoogleSync } = useApp()
  const [gcalSnap, setGcalSnap] = useState<GoogleCalendarSyncSnapshot | null>(null)

  const refreshGcalSnap = useCallback(() => {
    setGcalSnap(readGoogleCalendarSyncSnapshot())
  }, [])

  useEffect(() => {
    clearOrphanedRunningSnapshot()
    refreshGcalSnap()
    const onCustom = () => refreshGcalSnap()
    window.addEventListener('lessonapp3-gcal-sync', onCustom)
    return () => window.removeEventListener('lessonapp3-gcal-sync', onCustom)
  }, [refreshGcalSnap])

  useEffect(() => {
    if (!gcalSnap || gcalSnap.status === 'running') return
    if (!gcalSnap.message) return
    const t = setTimeout(() => {
      clearGoogleCalendarSyncSnapshot()
      dismissGoogleSync()
      setGcalSnap(null)
    }, GCAL_RESULT_AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [gcalSnap, dismissGoogleSync])

  const showPersist =
    persistUi.phase === 'pending' ||
    persistUi.phase === 'saving' ||
    persistUi.phase === 'saved' ||
    persistUi.phase === 'error' ||
    persistUi.phase === 'local_saved'

  const showGcalSyncing = persistUi.googleSync

  const showGcalResult =
    !showGcalSyncing &&
    gcalSnap != null &&
    gcalSnap.status !== 'running' &&
    gcalSnap.message.length > 0 &&
    !persistUi.googleSyncDismissed

  if (!showPersist && !showGcalSyncing && !showGcalResult) return null

  const handleDismissGcal = () => {
    clearGoogleCalendarSyncSnapshot()
    dismissGoogleSync()
    setGcalSnap(null)
  }

  return (
    <div
      className="fixed bottom-16 md:bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 flex flex-col gap-1.5 pointer-events-none"
      aria-live="polite"
    >
      {showPersist && (
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl border shadow-md text-xs font-medium',
            persistUi.phase === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : persistUi.phase === 'saved' || persistUi.phase === 'local_saved'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-gray-200 text-gray-700'
          )}
        >
          {persistUi.phase === 'pending' || persistUi.phase === 'saving' ? (
            <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
          ) : persistUi.phase === 'error' ? (
            <CloudOff size={14} className="shrink-0" aria-hidden />
          ) : (
            <Cloud size={14} className="shrink-0" aria-hidden />
          )}
          <span className="flex-1 min-w-0">
            {persistUi.phase === 'pending' && '保存待ち…'}
            {persistUi.phase === 'saving' && 'サーバーに保存中…'}
            {persistUi.phase === 'saved' &&
              `保存済み${persistUi.savedAt ? `（${formatSavedAt(persistUi.savedAt)}）` : ''}`}
            {persistUi.phase === 'local_saved' && '端末に保存済み'}
            {persistUi.phase === 'error' && (persistUi.errorMessage ?? '保存に失敗しました')}
          </span>
          {(persistUi.phase === 'saved' || persistUi.phase === 'local_saved') && (
            <button
              type="button"
              onClick={dismissPersistSaved}
              className="p-0.5 rounded hover:bg-black/5 shrink-0"
              aria-label="閉じる"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {showGcalSyncing && (
        <div className="pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-xl border shadow-md text-xs bg-sky-50 border-sky-200 text-sky-900">
          <Loader2 size={14} className="animate-spin shrink-0 mt-0.5" aria-hidden />
          <span className="flex-1 min-w-0 leading-snug">Google カレンダーと同期中…</span>
        </div>
      )}

      {showGcalResult && gcalSnap && (
        <div
          className={cn(
            'pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-xl border shadow-md text-xs',
            gcalSnap.ok ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-amber-50 border-amber-200 text-amber-900'
          )}
        >
          <CalendarSync size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span className="flex-1 min-w-0 leading-snug">{gcalSnap.message}</span>
          <button
            type="button"
            onClick={handleDismissGcal}
            className="p-0.5 rounded hover:bg-black/5 shrink-0"
            aria-label="閉じる"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
