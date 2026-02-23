'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, UserPlus, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '@/lib/store'
import Button from '@/components/ui/Button'
import { Student, Accompanist } from '@/types'

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export default function RosterPage() {
  const { state, dispatch } = useApp()
  const { students, accompanists, currentUser } = state
  const [newStudentName, setNewStudentName] = useState('')
  const [newAccompanistName, setNewAccompanistName] = useState('')
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editingStudentName, setEditingStudentName] = useState('')
  const [editingAccompanistId, setEditingAccompanistId] = useState<string | null>(null)
  const [editingAccompanistName, setEditingAccompanistName] = useState('')

  if (!currentUser || currentUser.role !== 'teacher') {
    return (
      <div className="text-center py-12 text-gray-400">先生のみアクセスできます</div>
    )
  }

  const handleAddStudent = () => {
    const name = newStudentName.trim()
    if (!name) return
    dispatch({
      type: 'ADD_STUDENT',
      payload: { id: generateId('student'), name },
    })
    setNewStudentName('')
  }

  const handleAddAccompanist = () => {
    const name = newAccompanistName.trim()
    if (!name) return
    dispatch({
      type: 'ADD_ACCOMPANIST',
      payload: { id: generateId('accompanist'), name },
    })
    setNewAccompanistName('')
  }

  const startEditStudent = (s: Student) => {
    setEditingStudentId(s.id)
    setEditingStudentName(s.name)
  }
  const saveEditStudent = () => {
    if (editingStudentId && editingStudentName.trim()) {
      dispatch({ type: 'UPDATE_STUDENT', payload: { id: editingStudentId, name: editingStudentName.trim() } })
      setEditingStudentId(null)
      setEditingStudentName('')
    }
  }
  const cancelEditStudent = () => {
    setEditingStudentId(null)
    setEditingStudentName('')
  }

  const startEditAccompanist = (a: Accompanist) => {
    setEditingAccompanistId(a.id)
    setEditingAccompanistName(a.name)
  }
  const saveEditAccompanist = () => {
    if (editingAccompanistId && editingAccompanistName.trim()) {
      dispatch({ type: 'UPDATE_ACCOMPANIST', payload: { id: editingAccompanistId, name: editingAccompanistName.trim() } })
      setEditingAccompanistId(null)
      setEditingAccompanistName('')
    }
  }
  const cancelEditAccompanist = () => {
    setEditingAccompanistId(null)
    setEditingAccompanistName('')
  }

  const deleteStudent = (id: string) => {
    if (confirm('この学生を名簿から削除しますか？')) dispatch({ type: 'DELETE_STUDENT', payload: id })
  }
  const deleteAccompanist = (id: string) => {
    if (confirm('この伴奏者を名簿から削除しますか？')) dispatch({ type: 'DELETE_ACCOMPANIST', payload: id })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">名簿管理</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">氏名のみで登録・編集・削除できます。</p>

      {/* 学生 */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <UserPlus size={16} /> 学生名簿
        </h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
            placeholder="氏名を入力"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <Button onClick={handleAddStudent} disabled={!newStudentName.trim()}>
            学生を追加
          </Button>
        </div>
        <ul className="space-y-2">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
              {editingStudentId === s.id ? (
                <>
                  <input
                    type="text"
                    value={editingStudentName}
                    onChange={(e) => setEditingStudentName(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    autoFocus
                  />
                  <button onClick={saveEditStudent} className="text-sm text-indigo-600 font-medium">保存</button>
                  <button onClick={cancelEditStudent} className="text-sm text-gray-500">キャンセル</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{s.name}</span>
                  <button onClick={() => startEditStudent(s)} className="p-1.5 text-gray-500 hover:text-indigo-600 rounded" aria-label="編集">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteStudent(s.id)} className="p-1.5 text-gray-500 hover:text-red-600 rounded" aria-label="削除">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {students.length === 0 && (
          <p className="text-sm text-gray-400 py-2">学生がいません。「学生を追加」で追加してください。</p>
        )}
      </section>

      {/* 伴奏者 */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
          <UserPlus size={16} /> 伴奏者名簿
        </h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newAccompanistName}
            onChange={(e) => setNewAccompanistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddAccompanist()}
            placeholder="氏名を入力"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <Button onClick={handleAddAccompanist} disabled={!newAccompanistName.trim()}>
            伴奏者を追加
          </Button>
        </div>
        <ul className="space-y-2">
          {accompanists.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
              {editingAccompanistId === a.id ? (
                <>
                  <input
                    type="text"
                    value={editingAccompanistName}
                    onChange={(e) => setEditingAccompanistName(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    autoFocus
                  />
                  <button onClick={saveEditAccompanist} className="text-sm text-indigo-600 font-medium">保存</button>
                  <button onClick={cancelEditAccompanist} className="text-sm text-gray-500">キャンセル</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{a.name}</span>
                  <button onClick={() => startEditAccompanist(a)} className="p-1.5 text-gray-500 hover:text-indigo-600 rounded" aria-label="編集">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteAccompanist(a.id)} className="p-1.5 text-gray-500 hover:text-red-600 rounded" aria-label="削除">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {accompanists.length === 0 && (
          <p className="text-sm text-gray-400 py-2">伴奏者がいません。「伴奏者を追加」で追加してください。</p>
        )}
      </section>
    </div>
  )
}
