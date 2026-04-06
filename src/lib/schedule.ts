import { DaySettings, LessonSlot, TimeItem } from '@/types'

const SLOT_DURATION = 45  // minutes
const BREAK_DURATION = 10 // minutes
const SLOTS_PER_BREAK = 2 // 2コマごとに休憩
const LUNCH_START = '12:10'
const LUNCH_END = '13:00'

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(time: string, mins: number): string {
  return minutesToTime(timeToMinutes(time) + mins)
}

/** 指定日のタイムラインを生成する（スロット＋休憩） */
export function generateTimeItems(
  date: string,
  settings: DaySettings,
  existingSlots: LessonSlot[]
): TimeItem[] {
  const items: TimeItem[] = []
  let currentTime = settings.startTime || '09:00'
  const endTime = settings.endTimeMode
  const endMinutes = timeToMinutes(endTime)
  const lunchStartMin = timeToMinutes(LUNCH_START)
  const lunchEndMin = timeToMinutes(LUNCH_END)

  let consecutiveCount = 0
  let slotIndex = 0

  while (true) {
    const currentMin = timeToMinutes(currentTime)
    const slotEndMin = currentMin + SLOT_DURATION

    // 終了時間を超えるならループ終了
    if (slotEndMin > endMinutes) break

    // 昼休みをまたぐ場合の処理
    if (!settings.lunchBreakOpen) {
      // 現在時刻が昼休み範囲内
      if (currentMin >= lunchStartMin && currentMin < lunchEndMin) {
        // 昼休みブロックを挿入（まだ挿入していなければ）
        const lastItem = items[items.length - 1]
        if (!lastItem || lastItem.type !== 'lunch') {
          items.push({ type: 'lunch', startTime: LUNCH_START, endTime: LUNCH_END })
          consecutiveCount = 0
        }
        currentTime = LUNCH_END
        continue
      }
      // スロットが昼休みにかかる場合
      if (currentMin < lunchStartMin && slotEndMin > lunchStartMin) {
        // 昼休み前の半端はスキップして昼休みへ
        items.push({ type: 'lunch', startTime: LUNCH_START, endTime: LUNCH_END })
        currentTime = LUNCH_END
        consecutiveCount = 0
        continue
      }
    } else {
      // 昼休み開放時：昼休み帯をレッスン可能枠にする。収まる45分枠（12:10-12:55）を1コマ追加し、午後は13:00スタート
      if (currentMin >= lunchStartMin && currentMin < lunchEndMin) {
        const slotEndInLunch = Math.min(currentMin + SLOT_DURATION, lunchEndMin)
        if (slotEndInLunch - currentMin >= SLOT_DURATION) {
          const endTimeStr = minutesToTime(slotEndInLunch)
          const existingSlot = existingSlots.find((s) => s.date === date && s.startTime === currentTime)
          const slotId = existingSlot?.id || `${date}-${currentTime.replace(':', '')}`
          const slot: LessonSlot = existingSlot || {
            id: slotId,
            date,
            startTime: currentTime,
            endTime: endTimeStr,
            roomName: settings.defaultRoom,
            teacherId: 'teacher-1',
            status: 'blocked',
          }
          slotIndex++
          items.push({
            type: 'slot',
            startTime: currentTime,
            endTime: endTimeStr,
            slot,
            slotIndex,
          })
          consecutiveCount++
          currentTime = endTimeStr
        }
        if (timeToMinutes(currentTime) < lunchEndMin) currentTime = LUNCH_END
        consecutiveCount = currentTime === LUNCH_END ? 1 : consecutiveCount
        continue
      }
      if (currentMin < lunchStartMin && slotEndMin > lunchStartMin) {
        currentTime = LUNCH_START
        continue
      }
    }

    // 既存スロットを探す
    const existingSlot = existingSlots.find(
      (s) => s.date === date && s.startTime === currentTime
    )

    const slotId = existingSlot?.id || `${date}-${currentTime.replace(':', '')}`

    // 新規枠はデフォルト「不可」。先生がチェックで「レッスン可」にした枠だけ available
    const slot: LessonSlot = existingSlot || {
      id: slotId,
      date,
      startTime: currentTime,
      endTime: minutesToTime(slotEndMin),
      roomName: settings.defaultRoom,
      teacherId: 'teacher-1',
      status: 'blocked',
    }

    slotIndex++
    items.push({
      type: 'slot',
      startTime: currentTime,
      endTime: minutesToTime(slotEndMin),
      slot,
      slotIndex,
    })

    consecutiveCount++
    currentTime = minutesToTime(slotEndMin)

    // 2コマごとに休憩を挿入
    if (consecutiveCount >= SLOTS_PER_BREAK) {
      const breakStartMin = timeToMinutes(currentTime)
      const breakEndMin = breakStartMin + BREAK_DURATION
      const breakEnd = minutesToTime(breakEndMin)

      // 休憩を追加する条件（次のいずれにも該当しないこと）
      // - 昼休み直後
      // - 12:10〜13:00 と重なる休憩（12:10からの休憩はいつも追加しない）
      // - 休憩後にスロットが入る余地がない（その日のレッスン終了時の休憩は追加しない）
      if (breakEndMin < endMinutes) {
        const isLunchJustEnded = currentTime === LUNCH_END
        const breakAtLunchStart =
          breakStartMin >= lunchStartMin && breakStartMin < lunchEndMin
        const noSlotAfterBreak = breakEndMin + SLOT_DURATION > endMinutes
        if (!isLunchJustEnded && !breakAtLunchStart && !noSlotAfterBreak) {
          items.push({ type: 'break', startTime: currentTime, endTime: breakEnd })
          currentTime = breakEnd
        }
      }
      consecutiveCount = 0
    }
  }

  return items
}

/** 予約可能スロット（availableのもの）だけ抽出 */
export function getAvailableSlots(items: TimeItem[]): TimeItem[] {
  return items.filter((i) => i.type === 'slot' && i.slot?.status === 'available')
}

/** 日付のサマリー情報 */
export function getDaySummary(items: TimeItem[]) {
  const slots = items.filter((i) => i.type === 'slot' && i.slot)
  const total = slots.length
  const available = slots.filter((i) => i.slot?.status === 'available').length
  const confirmed = slots.filter((i) => i.slot?.status === 'confirmed').length
  const pending = slots.filter((i) => i.slot?.status === 'pending').length
  return { total, available, confirmed, pending }
}

/** Date をローカル日付で YYYY-MM-DD に（タイムゾーンずれ防止） */
export function formatDateToYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD形式の日付文字列から表示用に変換（ローカルで解釈） */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('ja-JP', options || { month: 'long', day: 'numeric', weekday: 'short' })
}

/** 今日の日付をYYYY-MM-DD形式で返す（ローカル） */
export function today(): string {
  return formatDateToYYYYMMDD(new Date())
}

/** アンカー日を含む週の月曜〜日曜（各 YYYY-MM-DD）。月曜始まり */
export function getWeekDateRangeMonday(anchorDate: string): string[] {
  const [y, m, d] = anchorDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.getDay()
  const offsetToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(dt)
  monday.setDate(dt.getDate() + offsetToMonday)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday)
    x.setDate(monday.getDate() + i)
    out.push(formatDateToYYYYMMDD(x))
  }
  return out
}

/** 週範囲の見出し用（例: 4月7日〜4月13日） */
export function formatWeekRangeJa(weekDates: string[]): string {
  if (weekDates.length < 7) return ''
  const first = weekDates[0]
  const last = weekDates[6]
  const [y1, m1, d1] = first.split('-').map(Number)
  const [y2, m2, d2] = last.split('-').map(Number)
  if (y1 === y2) {
    return `${m1}月${d1}日〜${m2}月${d2}日`
  }
  return `${y1}年${m1}月${d1}日〜${y2}年${m2}月${d2}日`
}

/** 指定月の全日付を返す（ローカル） */
export function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = []
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    days.push(formatDateToYYYYMMDD(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

/** 仮押さえ期限を計算 */
export function calcProvisionalDeadline(hours: 24 | 48): string {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

/** 仮押さえが期限切れか確認 */
export function isProvisionalExpired(deadline?: string): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

/** 指定設定で「レッスン枠」のみの slot_index → startTime のリスト（休憩・昼休み除く）。週間マスター用。 */
export function getLessonSlotList(settings: DaySettings): { slot_index: number; startTime: string; endTime: string; isBreak?: boolean; isLunch?: boolean }[] {
  const items = generateTimeItems(
    '2000-01-03',
    settings,
    []
  )
  const list: { slot_index: number; startTime: string; endTime: string; isBreak?: boolean; isLunch?: boolean }[] = []
  let slotIndex = 0
  for (const item of items) {
    if (item.type === 'break') {
      list.push({ slot_index: -1, startTime: item.startTime, endTime: item.endTime, isBreak: true })
    } else if (item.type === 'lunch') {
      list.push({ slot_index: -1, startTime: item.startTime, endTime: item.endTime, isLunch: true })
    } else if (item.type === 'slot' && item.slot) {
      list.push({ slot_index: slotIndex, startTime: item.startTime, endTime: item.endTime })
      slotIndex++
    }
  }
  return list
}
