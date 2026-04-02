'use client'

import { useState, useEffect } from 'react'
import { Clock, User, Music, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useApp } from '@/lib/store'
import { generateTimeItems } from '@/lib/schedule'
import { LessonSlot, AccompanistAvailability, TimeItem } from '@/types'
import { cn, getInitials, generateId } from '@/lib/utils'
import { createSupabaseClient } from '@/lib/supabase/client'
import { insertActivityLog } from '@/lib/supabase/sync'

interface BookingModalProps {
  open: boolean
  onClose: () => void
  slot: LessonSlot | null
}

export default function BookingModal({ open, onClose, slot }: BookingModalProps) {
  const { state, dispatch, getUserById, getAvailabilitiesForSlot, getDaySettings, getLessonsForDate } = useApp()
  const { currentUser } = state
  const [withAccompanist, setWithAccompanist] = useState(false)
  const [selectedAccompanist, setSelectedAccompanist] = useState<string>('')
  const [submitted, setSubmitted] = useState(false)
  const [assignStudentId, setAssignStudentId] = useState<string>('')
  const [assignAccompanistId, setAssignAccompanistId] = useState<string>('')
  const [assignError, setAssignError] = useState('')

  useEffect(() => {
    if (slot) {
      setAssignStudentId(slot.studentId || '')
      setAssignAccompanistId(slot.accompanistId || '')
      setAssignError('')
    }
  }, [slot?.id, slot?.studentId, slot?.accompanistId])

  if (!slot || !currentUser) return null

  const isTeacher = currentUser.role === 'teacher'
  const isStudent = currentUser.role === 'student'
  const isAccompanist = currentUser.role === 'accompanist'

  const availabilities: AccompanistAvailability[] = getAvailabilitiesForSlot(slot.id)
  const accompanistUsers = availabilities.map((a) => getUserById(a.accompanistId)).filter(Boolean)
  const students = state.users.filter((u) => u.role === 'student')
  const accompanists = state.users.filter((u) => u.role === 'accompanist')

  // 前後の確定枠にいる伴奏者＝連続で対応可能（推奨）
  const settingsForDate = getDaySettings(slot.date)
  const lessonsForDate = getLessonsForDate(slot.date)
  const timeItems: TimeItem[] = generateTimeItems(slot.date, settingsForDate, lessonsForDate)
  const slotItems = timeItems.filter((i) => i.type === 'slot' && i.slot) as Array<TimeItem & { slot: LessonSlot }>
  const slotIdx = slotItems.findIndex((i) => i.slot?.id === slot.id)
  const adjacentIds: string[] = []
  if (slotIdx >= 0) {
    const prev = slotItems[slotIdx - 1]?.slot
    const next = slotItems[slotIdx + 1]?.slot
    if (prev?.status === 'confirmed' && prev.accompanistId) adjacentIds.push(prev.accompanistId)
    if (next?.status === 'confirmed' && next.accompanistId && !adjacentIds.includes(next.accompanistId)) adjacentIds.push(next.accompanistId)
  }
  const continuityAccompanistIds = new Set(adjacentIds)

  const student = getUserById(slot.studentId)
  const accompanist = getUserById(slot.accompanistId)
  const handleBook = () => {
    if (!isStudent || !currentUser) return
    const otherOnSameDay = lessonsForDate.some(
      (l) => l.id !== slot.id && (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id
    )
    if (otherOnSameDay) {
      setAssignError('同じ日にすでにレッスンが入っています。1日1回までです。')
      return
    }
    const acc = withAccompanist ? selectedAccompanist : undefined

    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: currentUser.id,
        accompanistId: acc || undefined,
        status: 'confirmed',
      },
    })

    if (acc) {
      dispatch({ type: 'CONFIRM_ACCOMPANIED', payload: { slotId: slot.id } })
    }

    insertActivityLog(createSupabaseClient(), {
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'lesson_booked',
      lessonId: slot.id,
      lessonDate: slot.date,
      lessonStartTime: slot.startTime,
      details: {
        studentName: currentUser.name,
        accompanistName: acc ? getUserById(acc)?.name : undefined,
      },
    })
    setSubmitted(true)
  }

  const handleCancel = () => {
    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: undefined,
        accompanistId: undefined,
        status: 'available',
        provisionalDeadline: undefined,
      },
    })
    // 先生の「枠をブロック」はログに残さない。生徒・伴奏者によるキャンセルのみログ
    if (currentUser && currentUser.role !== 'teacher') {
      insertActivityLog(createSupabaseClient(), {
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'lesson_cancelled',
        lessonId: slot.id,
        lessonDate: slot.date,
        lessonStartTime: slot.startTime,
        details: student ? { studentName: student.name } : undefined,
      })
    }
    onClose()
  }

  const handleTeacherAssign = () => {
    if (!assignStudentId || !currentUser) return
    const otherOnSameDay = lessonsForDate.some(
      (l) => l.id !== slot.id && (l.status === 'confirmed' || l.status === 'pending') && l.studentId === assignStudentId
    )
    if (otherOnSameDay) {
      setAssignError('この生徒は同じ日にすでにレッスンが入っています。1日1回までです。')
      return
    }
    setAssignError('')
    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: assignStudentId,
        accompanistId: assignAccompanistId || undefined,
        status: 'confirmed',
        provisionalDeadline: undefined,
      },
    })
    if (assignAccompanistId) {
      dispatch({ type: 'CONFIRM_ACCOMPANIED', payload: { slotId: slot.id } })
    }
    insertActivityLog(createSupabaseClient(), {
      actorId: currentUser.id,
      actorName: currentUser.name,
      action: 'lesson_assigned',
      lessonId: slot.id,
      lessonDate: slot.date,
      lessonStartTime: slot.startTime,
      details: {
        studentName: getUserById(assignStudentId)?.name,
        accompanistName: assignAccompanistId ? getUserById(assignAccompanistId)?.name : undefined,
      },
    })
    setAssignStudentId('')
    setAssignAccompanistId('')
    onClose()
  }

  // 伴奏者の「可」表明トグル
  const handleToggleAvailability = () => {
    if (!isAccompanist || !currentUser) return
    const existing = availabilities.find((a) => a.accompanistId === currentUser.id)
    if (existing) {
      dispatch({ type: 'REMOVE_AVAILABILITY', payload: { slotId: slot.id, accompanistId: currentUser.id } })
      insertActivityLog(createSupabaseClient(), {
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'availability_removed',
        lessonId: slot.id,
        lessonDate: slot.date,
        lessonStartTime: slot.startTime,
      })
    } else {
      dispatch({
        type: 'ADD_AVAILABILITY',
        payload: { id: generateId(), slotId: slot.id, accompanistId: currentUser.id, createdAt: new Date().toISOString() },
      })
      insertActivityLog(createSupabaseClient(), {
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'availability_added',
        lessonId: slot.id,
        lessonDate: slot.date,
        lessonStartTime: slot.startTime,
      })
    }
  }

  const myAvailability = availabilities.find((a) => a.accompanistId === currentUser.id)

  if (submitted) {
    return (
      <Modal open={open} onClose={() => { onClose(); setSubmitted(false) }} title="予約完了">
        <div className="text-center py-4">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={28} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-gray-900 mb-1">予約が完了しました</p>
          <Button className="mt-5 w-full" onClick={() => { onClose(); setSubmitted(false) }}>
            閉じる
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${slot.startTime} 〜 ${slot.endTime}`}
    >
      {/* スロット基本情報 */}
      <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock size={15} className="text-gray-400" />
          <span>{slot.date.replace(/-/g, '/')} {slot.startTime}〜{slot.endTime}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-400">🏫</span>
          <span>{slot.roomName}</span>
        </div>
      </div>

      {assignError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{assignError}</p>
      )}

      {/* 予約済み情報 */}
      {(slot.status === 'pending' || slot.status === 'confirmed') && (
        <div className="mb-4 space-y-2">
          {student && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
              <div className="w-7 h-7 bg-blue-200 rounded-full flex items-center justify-center text-blue-800 text-xs font-semibold">
                {getInitials(student.name)}
              </div>
              <div>
                <p className="text-xs text-blue-500">生徒</p>
                <p className="text-sm font-medium text-gray-900">{student.name}</p>
              </div>
            </div>
          )}
          {accompanist && (
            <div className="flex items-center gap-2 p-2.5 bg-teal-50 rounded-lg">
              <div className="w-7 h-7 bg-teal-200 rounded-full flex items-center justify-center text-teal-800 text-xs font-semibold">
                {getInitials(accompanist.name)}
              </div>
              <div>
                <p className="text-xs text-teal-500">伴奏者</p>
                <p className="text-sm font-medium text-gray-900">{accompanist.name}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 先生のアクション ── */}
      {isTeacher && (
        <div className="space-y-2">
          {(slot.status === 'confirmed' || slot.status === 'pending') && (
            <>
              <div className="mb-4 p-3 bg-indigo-50 rounded-xl">
                <p className="text-xs font-medium text-indigo-600 mb-2">生徒・伴奏者を変更</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">生徒</p>
                    <select
                      value={assignStudentId}
                      onChange={(e) => setAssignStudentId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">選択してください</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">伴奏者（任意）</p>
                    <select
                      value={assignAccompanistId}
                      onChange={(e) => setAssignAccompanistId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">個人レッスン</option>
                      {accompanists.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleTeacherAssign}
                    disabled={!assignStudentId}
                  >
                    変更を反映
                  </Button>
                </div>
              </div>
              <Button variant="secondary" className="w-full" onClick={handleCancel}>
                枠をブロック
              </Button>
            </>
          )}
          {slot.status === 'available' && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">生徒を指定</p>
                <select
                  value={assignStudentId}
                  onChange={(e) => setAssignStudentId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">選択してください</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">伴奏者（任意）</p>
                <select
                  value={assignAccompanistId}
                  onChange={(e) => setAssignAccompanistId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">個人レッスン</option>
                  {accompanists.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">名簿に登録した伴奏者から選択できます</p>
              </div>
              <Button
                className="w-full"
                onClick={handleTeacherAssign}
                disabled={!assignStudentId}
              >
                この枠に指定する
              </Button>
              <Button variant="secondary" className="w-full" onClick={handleCancel}>
                枠をブロック
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── 生徒のアクション ── */}
      {isStudent && slot.status === 'available' && (
        <div className="space-y-4">
          {lessonsForDate.some(
            (l) => l.id !== slot.id && (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser?.id
          ) ? (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-3 rounded-xl">
              この日はすでにレッスンが入っています。同じ日に複数は予約できません。
            </p>
          ) : accompanistUsers.length === 0 ? (
            <>
              <p className="text-sm text-gray-600">
                この枠は伴奏者が「可」を出していないため、個人レッスンのみ予約できます。
              </p>
              <Button className="w-full" onClick={handleBook}>
                <User size={16} className="inline mr-1.5" />
                個人レッスンで予約する
              </Button>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">個人レッスン / 伴奏付きレッスン</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setWithAccompanist(false)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors',
                      !withAccompanist ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <User size={15} className="inline mr-1" />
                    個人レッスン
                  </button>
                  <button
                    onClick={() => setWithAccompanist(true)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors',
                      withAccompanist ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <Music size={15} className="inline mr-1" />
                    伴奏付き
                    <span className="ml-1 text-xs bg-teal-100 text-teal-700 px-1 rounded-full">{accompanistUsers.length}</span>
                  </button>
                </div>
              </div>

              {withAccompanist && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">伴奏者を選択</p>
                  <div className="space-y-2">
                    {accompanistUsers.map((acc) => acc && (
                      <button
                        key={acc.id}
                        onClick={() => setSelectedAccompanist(acc.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-colors text-left',
                          selectedAccompanist === acc.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 text-xs font-semibold">
                          {getInitials(acc.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                          {continuityAccompanistIds.has(acc.id) && (
                            <p className="text-xs text-amber-600 font-medium mt-0.5">推奨：連続で対応可能です</p>
                          )}
                        </div>
                        {selectedAccompanist === acc.id && <Check size={16} className="flex-shrink-0 text-teal-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleBook}
                disabled={withAccompanist && !selectedAccompanist}
              >
                この枠を予約する
              </Button>
            </>
          )}
        </div>
      )}

      {isStudent && (slot.status === 'pending' || slot.status === 'confirmed') && slot.studentId === currentUser.id && (
        <Button variant="danger" className="w-full" onClick={handleCancel}>
          予約をキャンセル
        </Button>
      )}

      {/* ── 伴奏者のアクション：タップで「伴奏付きレッスン可」に ── */}
      {isAccompanist && slot.status === 'available' && (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            この枠で伴奏付きレッスンができる場合は、下のボタンで「伴奏付きレッスン可」にしてください。
          </p>
          <button
            onClick={handleToggleAvailability}
            className={cn(
              'w-full py-3 rounded-xl border-2 font-medium text-sm transition-colors',
              myAvailability
                ? 'border-teal-500 bg-teal-50 text-teal-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            {myAvailability ? (
              <><Check size={16} className="inline mr-1.5" />伴奏付きレッスン可（解除する）</>
            ) : (
              <><Music size={16} className="inline mr-1.5" />伴奏付きレッスン可とする</>
            )}
          </button>
          {availabilities.length > 0 && (
            <p className="text-xs text-gray-400 text-center mt-2">
              現在 {availabilities.length}人が「可」としています
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
