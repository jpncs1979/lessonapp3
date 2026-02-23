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
    // 先生: 不可枠 ⇔ レッスン可
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
      if (slot.status === 'available' && !slot.studentId) {
        dispatch({
          type: 'UPDATE_LESSON',
          payload: {
            id: slot.id,
            status: 'blocked',
            studentId: undefined,
            accompanistId: undefined,
            provisionalDeadline: undefined,
          },
        })
        return
      }
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
    dispatch({
      type: 'UPDATE_LESSON',
      payload: {
        id: slot.id,
        studentId: currentUser.id,
        accompanistId,
        status: 'pending',
        provisionalDeadline: calcProvisionalDeadline(settings.provisionalHours ?? 24),
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

  const totalSlots = items.filter((i) => i.type === 'slot').length
  const availableSlots = items.filter((i) => i.type === 'slot' && i.slot?.status === 'available').length
  const confirmedSlots = items.filter((i) => i.type === 'slot' && i.slot?.status === 'confirmed').length

  return (
    <div>
      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevDate} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-gray-900">{formatDate(date)}</h2>
          {settings.isLessonDay ? (
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                settings.endTimeMode === '20:00' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              )}>
                〜{settings.endTimeMode}
              </span>
              <span className="text-xs text-gray-500">{totalSlots}コマ / レッスン可{availableSlots} / 確定{confirmedSlots}</span>
            </div>
          ) : (
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
              onSlotClick={handleSlotClick}
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
  onSlotClick: (slot: LessonSlot) => void
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
  item, items, itemIndex, currentUserId, isTeacher, isAccompanist, isStudent, onSlotClick, onBook, onCancel, getUserById, getAvailabilitiesForSlot
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
  const studentTapForIndividual = isStudent && slot.status === 'available'
  const hasAccompanistAvailable = slot.status === 'available' && availabilities.length > 0
  const isConfirmedIndividual = slot.status === 'confirmed' && !accompanist
  const isConfirmedAccompanied = slot.status === 'confirmed' && accompanist
  const isMine = isMyLesson || myAvailability || slot.accompanistId === currentUserId
  const isAccompanistCanAdd = isAccompanist && slot.status === 'confirmed' && slot.studentId && !slot.accompanistId
  const isAccompanistCanRemove = isAccompanist && slot.status === 'confirmed' && slot.accompanistId === currentUserId

  const handleSlotAreaClick = () => {
    if (studentTapForIndividual) {
      onBook(slot)
      return
    }
    if (clickable) onSlotClick(slot)
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-end w-10 flex-shrink-0 pt-2">
        <span className="text-xs font-mono text-gray-500">{slot.startTime}</span>
      </div>

      <div
        onClick={handleSlotAreaClick}
        className={cn(
          'flex-1 rounded-xl border p-3 transition-colors',
          (clickable || studentTapForIndividual) && 'cursor-pointer',
          slot.status === 'available' && 'border-2 border-red-500',
          slot.status === 'available' && !hasAccompanistAvailable && 'bg-white hover:bg-gray-50',
          slot.status === 'available' && hasAccompanistAvailable && 'bg-teal-50 hover:bg-teal-100',
          slot.status === 'pending' && 'bg-amber-50 border-amber-200 hover:bg-amber-100',
          isConfirmedIndividual && 'bg-blue-50 border-blue-200',
          isConfirmedAccompanied && 'bg-emerald-50 border-emerald-200',
          slot.status === 'blocked' && 'bg-gray-100 border-gray-200',
          isMine && 'ring-2 ring-offset-1 ring-indigo-400',
        )}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">{slot.startTime}〜{slot.endTime}</span>
          <span className="text-xs text-gray-400">{slot.roomName}</span>
        </div>

        {/* 確定済み・承認待ち: 名前と伴奏者 */}
        {(slot.status === 'confirmed' || slot.status === 'pending') && (student || accompanist) && (
          <div className="mt-2">
            {student && (
              <p className={cn('font-semibold text-gray-900', isConfirmedIndividual ? 'text-blue-900' : 'text-emerald-900')}>
                {student.name}
                {isMyLesson && <span className="text-indigo-600 ml-1">（あなた）</span>}
              </p>
            )}
            {accompanist && (
              <p className="text-sm text-teal-700 mt-0.5 flex items-center gap-1">
                <Music size={12} />
                伴奏：{accompanist.name}
              </p>
            )}
            {slot.status === 'pending' && slot.provisionalDeadline && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle size={11} />
                {formatDeadline(slot.provisionalDeadline)}
              </p>
            )}
          </div>
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

        {/* 空き枠: 伴奏者・先生用の表示 */}
        {!isStudent && slot.status === 'available' && (
          <div className="mt-2 space-y-1">
            {hasAccompanistAvailable ? (
              <>
                {isAccompanist && (
                  <>
                    <p className="text-xs text-teal-700">{availabilities.map((a) => getUserById(a.accompanistId)?.name).filter(Boolean).join('、')}</p>
                    <p className="text-xs text-teal-600">{myAvailability ? 'タップで解除' : 'タップで追加'}</p>
                  </>
                )}
              </>
            ) : (
              <>
                {isTeacher && <p className="text-xs text-gray-400 mt-1">レッスン可</p>}
                {isAccompanist && <p className="text-xs text-teal-600 mt-1">タップで伴奏付きレッスン可に</p>}
              </>
            )}
          </div>
        )}

        {/* 伴奏者: 確定済み個人レッスン（すでに生徒が入っている枠）にも伴奏可を追加できる */}
        {isAccompanist && isAccompanistCanAdd && (
          <p className="text-xs text-teal-600 mt-1">タップで伴奏可を追加</p>
        )}
        {isAccompanist && isAccompanistCanRemove && (
          <p className="text-xs text-teal-600 mt-1">タップで伴奏可を解除</p>
        )}

        {slot.status === 'blocked' && isTeacher && (
          <p className="text-xs text-gray-400 mt-1">タップでレッスン可に</p>
        )}
        {slot.status === 'blocked' && (isStudent || isAccompanist) && (
          <p className="text-xs text-gray-500 font-medium mt-1">不可</p>
        )}
      </div>

      {/* 枠外に伴奏者スタンプ（生徒はタップで伴奏付き予約、先生は表示のみ） */}
      {(isStudent || isTeacher) && slot.status === 'available' && availabilities.length > 0 && (
        <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {availabilities.map((a) => {
            const acc = getUserById(a.accompanistId)
            return acc ? (
              isStudent ? (
                <button
                  key={a.accompanistId}
                  type="button"
                  onClick={() => onBook(slot, a.accompanistId)}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-teal-100 text-teal-700 hover:bg-teal-200 border border-teal-200 whitespace-nowrap"
                  title={`${acc.name} 伴奏付きで予約`}
                >
                  <Music size={10} className="inline mr-0.5" />
                  {acc.name}
                </button>
              ) : (
                <span
                  key={a.accompanistId}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-teal-100 text-teal-700 border border-teal-200 whitespace-nowrap inline-flex items-center"
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
