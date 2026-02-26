'use client'

import { useState } from 'react'
import { Clock, User, Music, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import { generateTimeItems, formatDate, formatDateToYYYYMMDD } from '@/lib/schedule'
import { TimeItem, LessonSlot } from '@/types'
import { cn, getInitials, formatDeadline, calcProvisionalDeadline, generateId } from '@/lib/utils'
import BookingModal from '@/components/booking/BookingModal'

interface DayTimetableProps {
  date: string
}

export default function DayTimetable({ date }: DayTimetableProps) {
  const router = useRouter()
  const { state, dispatch, getDaySettings, getLessonsForDate, getUserById, getAvailabilitiesForSlot } = useApp()
  const { currentUser, lessons } = state
  const [selectedSlot, setSelectedSlot] = useState<LessonSlot | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [studentSameDayError, setStudentSameDayError] = useState<string | null>(null)

  const settings = getDaySettings(date)
  const lessonsForDate = getLessonsForDate(date)
  const items = generateTimeItems(date, settings, lessonsForDate)

  const isTeacher = currentUser?.role === 'teacher'
  const isAccompanist = currentUser?.role === 'accompanist'

  const prevDate = () => {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - 1)
    router.push(`/day/${formatDateToYYYYMMDD(dt)}`)
  }
  const nextDate = () => {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + 1)
    router.push(`/day/${formatDateToYYYYMMDD(dt)}`)
  }

  const handleSlotClick = (slot: LessonSlot) => {
    if (slot.status === 'break' || slot.status === 'lunch') return
    // 先生: 不可枠は1タップでレッスン可に。空き枠も1タップで不可に。生徒指定は枠内の「生徒を指定」から
    if (isTeacher) {
      if (slot.status === 'blocked') {
        const inState = lessons.some((l) => l.id === slot.id)
        if (inState) {
          dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, status: 'available' } })
        } else {
          dispatch({ type: 'ADD_LESSON', payload: { ...slot, status: 'available' } })
        }
        return
      }
      if (slot.status === 'available') {
        const inState = lessons.some((l) => l.id === slot.id)
        if (inState) {
          dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, status: 'blocked' } })
        } else {
          dispatch({ type: 'ADD_LESSON', payload: { ...slot, status: 'blocked' } })
        }
        return
      }
      // confirmed / pending のときはモーダルで生徒・伴奏者を変更
      setSelectedSlot(slot)
      setModalOpen(true)
      return
    }
    // 伴奏者: 1タップで伴奏付きレッスン可のトグル、または個人レッスンに伴奏可を追加/解除
    if (isAccompanist && currentUser) {
      const availabilities = getAvailabilitiesForSlot(slot.id)
      const myAv = availabilities.find((a) => a.accompanistId === currentUser.id)
      if (slot.status === 'available') {
        if (myAv) {
          dispatch({ type: 'REMOVE_AVAILABILITY', payload: { slotId: slot.id, accompanistId: currentUser.id } })
        } else {
          dispatch({
            type: 'ADD_AVAILABILITY',
            payload: { id: generateId(), slotId: slot.id, accompanistId: currentUser.id, createdAt: new Date().toISOString() },
          })
        }
        return
      }
      if (slot.status === 'confirmed' && slot.studentId && !slot.accompanistId) {
        dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, accompanistId: currentUser.id } })
        return
      }
      if (slot.status === 'confirmed' && slot.accompanistId === currentUser.id) {
        dispatch({ type: 'UPDATE_LESSON', payload: { id: slot.id, accompanistId: undefined } })
        return
      }
    }
    // 生徒: 予約・キャンセルは枠内ボタンで1タップ。モーダルは開かない
    if (currentUser?.role === 'student') return
    if (slot.status === 'blocked') return
    setSelectedSlot(slot)
    setModalOpen(true)
  }

  const handleBookForStudent = (slot: LessonSlot, accompanistId?: string) => {
    if (!currentUser || currentUser.role !== 'student') return
    const alreadyHasLesson = lessonsForDate.some(
      (l) => l.id !== slot.id && (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id
    )
    if (alreadyHasLesson) {
      setStudentSameDayError('同じ日にはレッスンは1回までです。')
      setTimeout(() => setStudentSameDayError(null), 4000)
      return
    }
    setStudentSameDayError(null)
    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: currentUser.id,
        accompanistId,
        status: 'confirmed',
        provisionalDeadline: undefined,
      },
    })
    if (accompanistId) {
      dispatch({ type: 'CONFIRM_ACCOMPANIED', payload: { slotId: slot.id } })
    }
  }

  const handleCancelForStudent = (slot: LessonSlot) => {
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
  }

  return (
    <div>
      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevDate} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-gray-900">{formatDate(date)}</h2>
          {!settings.isLessonDay && (
            <span className="text-xs text-gray-400">レッスンなし</span>
          )}
        </div>
        <button onClick={nextDate} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {/* 先生用: 終了時間切替 */}
      {isTeacher && settings.isLessonDay && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-purple-50 rounded-xl">
          <span className="text-xs text-purple-700 font-medium flex-1">終了時間</span>
          <div className="flex rounded-lg overflow-hidden border border-purple-200">
            {(['16:30', '20:00'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: { ...settings, endTimeMode: mode } })}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  settings.endTimeMode === mode
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-purple-600 hover:bg-purple-50'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 生徒：同日にすでにレッスンがあるときのメッセージ */}
      {studentSameDayError && currentUser?.role === 'student' && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {studentSameDayError}
        </div>
      )}

      {/* タイムライン */}
      {!settings.isLessonDay ? (
        <div className="text-center py-12 text-gray-400">
          <Clock size={40} className="mx-auto mb-2 opacity-30" />
          <p>この日はレッスンがありません</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <TimeSlotRow
              key={idx}
              item={item}
              items={items}
              itemIndex={idx}
              currentUserId={currentUser?.id}
              isTeacher={isTeacher}
              isAccompanist={isAccompanist}
              isStudent={currentUser?.role === 'student'}
              studentAlreadyHasLessonOnThisDay={
                currentUser?.role === 'student' &&
                lessonsForDate.some(
                  (l) => (l.status === 'confirmed' || l.status === 'pending') && l.studentId === currentUser.id
                )
              }
              onSlotClick={handleSlotClick}
              onTeacherOpenAssignModal={() => {
                const slot = item.type === 'slot' && item.slot ? item.slot : null
                if (slot) {
                  setSelectedSlot(slot)
                  setModalOpen(true)
                }
              }}
              onBook={handleBookForStudent}
              onCancel={handleCancelForStudent}
              getUserById={getUserById}
              getAvailabilitiesForSlot={getAvailabilitiesForSlot}
            />
          ))}
        </div>
      )}

      <BookingModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedSlot(null) }}
        slot={selectedSlot}
      />
    </div>
  )
}

// ── 個別スロット行 ───────────────────────────────────────────────

interface TimeSlotRowProps {
  item: TimeItem
  items: TimeItem[]
  itemIndex: number
  currentUserId?: string
  isTeacher: boolean
  isAccompanist: boolean
  isStudent: boolean
  /** 生徒がこの日すでにレッスン予約済み（同じ日は1回まで） */
  studentAlreadyHasLessonOnThisDay?: boolean
  onSlotClick: (slot: LessonSlot) => void
  /** 先生が空き枠で「生徒を指定」を押したときにモーダルを開く */
  onTeacherOpenAssignModal?: () => void
  onBook: (slot: LessonSlot, accompanistId?: string) => void
  onCancel: (slot: LessonSlot) => void
  getUserById: (id?: string) => import('@/types').User | undefined
  getAvailabilitiesForSlot: (slotId: string) => import('@/types').AccompanistAvailability[]
}

/** 前後の確定枠にいる伴奏者ID（この枠で「可能」の人と一致すれば連続対応推奨） */
function getAdjacentConfirmedAccompanistIds(items: TimeItem[], index: number): string[] {
  const slotItems = items.filter((i) => i.type === 'slot' && i.slot) as Array<TimeItem & { slot: LessonSlot }>
  const slotIndex = slotItems.findIndex((i) => i.slot?.id === (items[index] as TimeItem & { slot?: LessonSlot })?.slot?.id)
  if (slotIndex < 0) return []
  const prev = slotItems[slotIndex - 1]?.slot
  const next = slotItems[slotIndex + 1]?.slot
  const ids: string[] = []
  if (prev?.status === 'confirmed' && prev.accompanistId) ids.push(prev.accompanistId)
  if (next?.status === 'confirmed' && next.accompanistId && !ids.includes(next.accompanistId)) ids.push(next.accompanistId)
  return ids
}

function TimeSlotRow({
  item, items, itemIndex, currentUserId, isTeacher, isAccompanist, isStudent, studentAlreadyHasLessonOnThisDay, onSlotClick, onTeacherOpenAssignModal, onBook, onCancel, getUserById, getAvailabilitiesForSlot
}: TimeSlotRowProps) {
  if (item.type === 'break') {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{item.startTime}</span>
        <div className="flex-1 flex items-center gap-2 h-8 bg-gray-100 rounded-lg px-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">休憩 10分</span>
        </div>
      </div>
    )
  }

  if (item.type === 'lunch') {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{item.startTime}</span>
        <div className="flex-1 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="text-sm">🍱</span>
          <span className="text-xs text-orange-600 font-medium">昼休み 〜{item.endTime}</span>
        </div>
      </div>
    )
  }

  // スロット
  const { slot } = item
  if (!slot) return null

  const student = getUserById(slot.studentId)
  const accompanist = getUserById(slot.accompanistId)
  const availabilities = getAvailabilitiesForSlot(slot.id)
  const myAvailability = availabilities.find((a) => a.accompanistId === currentUserId)
  const isMyLesson = slot.studentId === currentUserId
  const adjacentAccompanistIds = item.type === 'slot' && slot ? getAdjacentConfirmedAccompanistIds(items, itemIndex) : []
  const continuityAccompanists = slot.status === 'available' && isStudent
    ? availabilities
        .filter((a) => adjacentAccompanistIds.includes(a.accompanistId))
        .map((a) => getUserById(a.accompanistId))
        .filter(Boolean)
    : []

  const clickable = !['break', 'lunch'].includes(slot.status) && (isTeacher || isAccompanist)
  const studentTapForIndividual = isStudent && slot.status === 'available' && !studentAlreadyHasLessonOnThisDay
  const hasAccompanistAvailable = slot.status === 'available' && availabilities.length > 0
  const isMine = isMyLesson || myAvailability || slot.accompanistId === currentUserId
  const isAccompanistCanAdd = isAccompanist && slot.status === 'confirmed' && slot.studentId && !slot.accompanistId
  const isAccompanistCanRemove = isAccompanist && slot.status === 'confirmed' && slot.accompanistId === currentUserId
  const isAccompanistMarkedAvailable = isAccompanist && slot.status === 'available' && myAvailability
  const isAccompanistMyLesson = isAccompanist && (slot.status === 'confirmed' || slot.status === 'pending') && slot.accompanistId === currentUserId

  const handleSlotAreaClick = () => {
    if (studentTapForIndividual) {
      onBook(slot)
      return
    }
    if (clickable) onSlotClick(slot)
  }

  const handleTeacherAssignClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTeacherOpenAssignModal?.()
  }

  return (
    <div className="flex items-start gap-2 sm:gap-3 min-w-0">
      <div className="flex flex-col items-end w-9 sm:w-10 flex-shrink-0 pt-2">
        <span className="text-xs font-mono text-gray-500">{slot.startTime}</span>
      </div>

      <div
        onClick={handleSlotAreaClick}
        className={cn(
          'flex-1 min-w-0 rounded-xl border p-3 transition-colors',
          (clickable || studentTapForIndividual) && 'cursor-pointer',
          slot.status === 'available' && !isAccompanistMarkedAvailable && 'bg-white border-gray-300 hover:bg-gray-50',
          isAccompanistMarkedAvailable && 'bg-white border-red-300 hover:bg-gray-50',
          (slot.status === 'confirmed' || slot.status === 'pending') && !(isStudent && isMyLesson) && !isAccompanistMyLesson && 'bg-blue-100 border-blue-300',
          ((slot.status === 'confirmed' || slot.status === 'pending') && (isStudent && isMyLesson || isAccompanistMyLesson)) && 'bg-red-50 border-red-300',
          slot.status === 'blocked' && 'bg-gray-200 border-gray-300',
        )}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">{slot.startTime}〜{slot.endTime}</span>
          <span className="text-xs text-gray-400">{slot.roomName}</span>
        </div>

        {/* 枠内の説明は「空き」と「不可」のみ。予約済みは生徒名（伴奏：〇〇）、伴奏者自分の枠は伴奏者名（生徒名） */}
        {slot.status === 'available' && !isAccompanistMarkedAvailable && (
          <p className="text-sm font-medium text-gray-700 mt-1">空き</p>
        )}
        {isAccompanistMarkedAvailable && (
          <p className="text-sm text-gray-900 mt-1">
            {getUserById(currentUserId)?.name}（未定）
          </p>
        )}
        {(slot.status === 'confirmed' || slot.status === 'pending') && (student || accompanist) && (
          <div className="mt-1">
            {isAccompanistMyLesson ? (
              <p className="text-sm text-gray-900">
                {accompanist?.name}（{student?.name ?? '—' }）
              </p>
            ) : student ? (
              <p className="text-sm text-gray-900">
                {student.name}
                {accompanist && <span className="text-gray-600">（伴奏：{accompanist.name}）</span>}
              </p>
            ) : (
              accompanist && (
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <Music size={12} />
                  伴奏：{accompanist.name}
                </p>
              )
            )}
            {slot.status === 'pending' && slot.provisionalDeadline && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle size={11} />
                {formatDeadline(slot.provisionalDeadline)}
              </p>
            )}
          </div>
        )}
        {slot.status === 'blocked' && (
          <p className="text-sm font-medium text-gray-500 mt-1">不可</p>
        )}

        {/* 生徒: 自分の予約は1タップでキャンセル */}
        {isStudent && (slot.status === 'pending' || slot.status === 'confirmed') && isMyLesson && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onCancel(slot)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200"
            >
              キャンセル
            </button>
          </div>
        )}

        {/* 生徒：同じ日にすでに予約済みのときは追加予約不可 */}
        {isStudent && slot.status === 'available' && studentAlreadyHasLessonOnThisDay && (
          <p className="text-xs text-gray-500 font-medium mt-1">この日は予約済み</p>
        )}
        {/* 空き枠: 伴奏者・先生用の表示（伴奏者が自分で「可」にした枠では表示しない） */}
        {!isStudent && slot.status === 'available' && !isAccompanistMarkedAvailable && (
          <div className="mt-2 space-y-1">
            {isTeacher && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400">タップで不可に</span>
                <button
                  type="button"
                  onClick={handleTeacherAssignClick}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 underline"
                >
                  生徒を指定
                </button>
              </div>
            )}
            {hasAccompanistAvailable ? (
              isAccompanist && (
                <>
                  <p className="text-xs text-gray-600">{availabilities.map((a) => getUserById(a.accompanistId)?.name).filter(Boolean).join('、')}</p>
                  <p className="text-xs text-gray-500">{myAvailability ? 'タップで解除' : 'タップで追加'}</p>
                </>
              )
            ) : (
              isAccompanist && <p className="text-xs text-gray-500 mt-1">タップで伴奏付きレッスン可に</p>
            )}
          </div>
        )}

        {/* 伴奏者: 確定済み個人レッスン（すでに生徒が入っている枠）にも伴奏可を追加できる */}
        {isAccompanist && isAccompanistCanAdd && (
          <p className="text-xs text-gray-500 mt-1">タップで伴奏可を追加</p>
        )}
        {isAccompanist && isAccompanistCanRemove && (
          <p className="text-xs text-gray-500 mt-1">タップで伴奏可を解除</p>
        )}

        {slot.status === 'blocked' && isTeacher && (
          <p className="text-xs text-gray-500 mt-1">タップでレッスン可に</p>
        )}
      </div>

      {/* 枠外に伴奏者スタンプ（生徒はタップで伴奏付き予約、先生は表示のみ。生徒は同日に1回までなので予約済みなら出さない） */}
      {((isStudent && !studentAlreadyHasLessonOnThisDay) || isTeacher) && slot.status === 'available' && availabilities.length > 0 && (
        <div className="flex flex-col gap-1 flex-shrink-0 flex-wrap max-w-[40%] sm:max-w-none" onClick={(e) => e.stopPropagation()}>
          {availabilities.map((a) => {
            const acc = getUserById(a.accompanistId)
            return acc ? (
              isStudent ? (
                <button
                  key={a.accompanistId}
                  type="button"
                  onClick={() => onBook(slot, a.accompanistId)}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 whitespace-nowrap"
                  title={`${acc.name} 伴奏付きで予約`}
                >
                  <Music size={10} className="inline mr-0.5" />
                  {acc.name}
                </button>
              ) : (
                <span
                  key={a.accompanistId}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 border border-green-200 whitespace-nowrap inline-flex items-center"
                >
                  <Music size={10} className="inline mr-0.5" />
                  {acc.name}
                </span>
              )
            ) : null
          })}
        </div>
      )}
    </div>
  )
}
