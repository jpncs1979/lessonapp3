'use client'

import { CloudUpload, Loader2, X, Check, AlertCircle } from 'lucide-react'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

function formatSavedAt(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SaveToServerPanel() {
  const { persistUi, saveToServer, dismissPersistStatus } = useApp()

  const isBusy = persistUi.phase === 'saving' || persistUi.phase === 'gcal_syncing'

  const statusText = (() => {
    switch (persistUi.phase) {
      case 'saving':
        return 'サーバーに保存中…'
      case 'saved':
        return `保存しました${persistUi.savedAt ? `（${formatSavedAt(persistUi.savedAt)}）` : ''}`
      case 'gcal_syncing':
        return 'Google カレンダーに反映中…'
      case 'done':
        return persistUi.gcalMessage
          ? `完了。${persistUi.gcalMessage}`
          : `保存しました${persistUi.savedAt ? `（${formatSavedAt(persistUi.savedAt)}）` : ''}`
      case 'error':
        return persistUi.errorMessage ?? '保存に失敗しました'
      case 'idle':
        return persistUi.hasUnsavedChanges ? '未保存の変更があります' : ''
      default:
        return ''
    }
  })()

  const statusOk = persistUi.phase === 'done' || persistUi.phase === 'saved'
  const statusError = persistUi.phase === 'error'

  return (
    <div className="space-y-2" aria-live="polite">
      <button
        type="button"
        onClick={() => void saveToServer()}
        disabled={isBusy}
        className={cn(
          'flex items-center justify-center gap-2 w-full px-3 py-2.5 text-xs font-semibold rounded-lg transition-colors',
          isBusy
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : persistUi.hasUnsavedChanges
              ? 'text-white bg-indigo-600 hover:bg-indigo-700'
              : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
        )}
      >
        {isBusy ? (
          <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
        ) : (
          <CloudUpload size={14} className="shrink-0" aria-hidden />
        )}
        {isBusy ? '保存中…' : 'サーバーに保存'}
        {persistUi.hasUnsavedChanges && !isBusy && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="未保存" aria-hidden />
        )}
      </button>

      {statusText && (
        <div
          className={cn(
            'flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-[11px] leading-snug',
            statusError && 'bg-red-50 text-red-800',
            statusOk && 'bg-emerald-50 text-emerald-800',
            !statusError && !statusOk && 'bg-gray-50 text-gray-600'
          )}
        >
          {isBusy ? (
            <Loader2 size={12} className="animate-spin shrink-0 mt-0.5" aria-hidden />
          ) : statusOk ? (
            <Check size={12} className="shrink-0 mt-0.5" aria-hidden />
          ) : statusError ? (
            <AlertCircle size={12} className="shrink-0 mt-0.5" aria-hidden />
          ) : null}
          <span className="flex-1 min-w-0">{statusText}</span>
          {(statusOk || statusError) && !isBusy && (
            <button
              type="button"
              onClick={dismissPersistStatus}
              className="p-0.5 rounded hover:bg-black/5 shrink-0"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
