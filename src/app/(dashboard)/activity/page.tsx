'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchActivityLogs, deleteActivityLog, type ActivityLogEntry, type ActivityLogAction } from '@/lib/supabase/sync'
import { ClipboardList, Trash2 } from 'lucide-react'

const ACTION_LABELS: Record<ActivityLogAction, string> = {
  slots_generated: 'レッスン枠を生成した',
  lesson_booked: 'レッスンを予約した',
  lesson_cancelled: 'レッスンをキャンセルした',
  lesson_approved: 'レッスンを承認した',
  lesson_assigned: 'レッスンを割り当てた',
  accompanist_added: '伴奏付きにした',
  accompanist_removed: '伴奏を解除した',
  availability_added: '出れるを追加した',
  availability_removed: '出れるを解除した',
  slot_unblocked: '枠のブロックを解除した',
}

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

function formatSlotInfo(entry: ActivityLogEntry): string {
  const parts: string[] = []
  if (entry.lessonDate) {
    const [y, m, d] = entry.lessonDate.split('-').map(Number)
    parts.push(`${m}月${d}日`)
  }
  if (entry.lessonStartTime) {
    parts.push(entry.lessonStartTime)
  }
  if (entry.details?.studentName) {
    parts.push(entry.details.studentName)
  }
  if (entry.details?.accompanistName) {
    parts.push(`伴奏: ${entry.details.accompanistName}`)
  }
  if (entry.details?.slotCount != null) {
    parts.push(`${entry.details.slotCount}コマ`)
  }
  return parts.length ? `（${parts.join('・')}）` : ''
}

export default function ActivityPage() {
  const { state } = useApp()
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadLogs = () => {
    const supabase = createSupabaseClient()
    fetchActivityLogs(supabase, 200).then(setLogs).finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    loadLogs()
  }, [])

  const isTeacher = state.currentUser?.role === 'teacher'
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!isTeacher) return
    setDeletingId(id)
    const supabase = createSupabaseClient()
    const { error } = await deleteActivityLog(supabase, id)
    setDeletingId(null)
    if (error) return
    setLogs((prev) => prev.filter((e) => e.id !== id))
  }

  if (!state.currentUser) return null

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <ClipboardList size={22} />
        操作ログ
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        誰が・いつ・何をしたかの記録です。全員が確認できます。{isTeacher && '先生はログを削除できます。'}
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-gray-500 py-8">まだ操作ログはありません。</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {logs.map((entry) => (
              <li key={entry.id} className="px-4 py-3 text-sm flex items-center justify-between gap-2 group">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                  <span className="text-gray-500 font-mono shrink-0">{formatLogTime(entry.createdAt)}</span>
                  <span className="font-medium text-gray-900">{entry.actorName}</span>
                  <span className="text-gray-700">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                    {formatSlotInfo(entry)}
                  </span>
                </div>
                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                    className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    title="このログを削除"
                    aria-label="削除"
                  >
                    {deletingId === entry.id ? (
                      <span className="inline-block w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
