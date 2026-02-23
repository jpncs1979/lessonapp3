'use client'

import { useState } from 'react'
import { useApp } from '@/lib/store'
import { LessonSlot } from '@/types'
import { Music } from 'lucide-react'
import Link from 'next/link'

export default function LessonSummary() {
  const { state, getUserById: getU } = useApp()
  const { lessons, users } = state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  const students = users.filter((u) => u.role === 'student')
  const teacherId = users.find((u) => u.role === 'teacher')?.id
  if (!teacherId) return null

  const relevantLessons = lessons.filter(
    (l) => l.teacherId === teacherId && (l.status === 'confirmed' || l.status === 'pending')
  ) as LessonSlot[]

  const counts = students.map((student) => {
    const myLessons = relevantLessons.filter((l) => l.studentId === student.id)
    const individual = myLessons.filter((l) => !l.accompanistId).length
    const withAccompanist = myLessons.filter((l) => l.accompanistId).length
    return {
      student,
      total: myLessons.length,
      individual,
      withAccompanist,
      lessons: myLessons.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    }
  })

  const selected = selectedStudentId ? counts.find((c) => c.student.id === selectedStudentId) : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">受講状況サマリー</h2>
        <p className="text-xs text-gray-500 mt-0.5">氏名をタップするとその生徒のレッスン一覧を表示</p>
      </div>
      <div className="p-4 space-y-2">
        {counts.map(({ student, total, individual, withAccompanist }) => (
          <div
            key={student.id}
            className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 text-sm"
          >
            <button
              type="button"
              onClick={() => setSelectedStudentId(selectedStudentId === student.id ? null : student.id)}
              className="font-medium text-gray-900 text-left hover:text-indigo-600 hover:underline"
            >
              {student.name}
            </button>
            <span className="text-gray-600">
              {total}回（個人: {individual} / 伴奏付き: {withAccompanist}）
            </span>
          </div>
        ))}
        {counts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">門下生の受講データがありません</p>
        )}
      </div>

      {selected && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 mb-2">{selected.student.name} のレッスン一覧</p>
          <ul className="space-y-1.5">
            {selected.lessons.length === 0 ? (
              <li className="text-sm text-gray-400">レッスンはありません</li>
            ) : (
              selected.lessons.map((l, i) => {
                const acc = l.accompanistId ? getU(l.accompanistId) : null
                return (
                  <li key={`${l.id}-${i}`} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/day/${l.date}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {l.date.replace(/-/g, '/')} {l.startTime}〜{l.endTime}
                    </Link>
                    <span className="text-gray-500">
                      {acc ? (
                        <span className="flex items-center gap-1 text-teal-600">
                          <Music size={12} />
                          伴奏付き（{acc.name}）
                        </span>
                      ) : (
                        '個人'
                      )}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
          <button
            type="button"
            onClick={() => setSelectedStudentId(null)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  )
}
