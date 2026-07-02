/** 日本の年度（4/1〜翌3/31） */

/** 日付が属する年度の開始年（4月始まり）。例: 2026-03-15 → 2025 */
export function getAcademicYearStartYear(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return new Date().getFullYear()
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 4 ? year : year - 1
}

/** 基準日時点の年度の開始日・終了日（YYYY-MM-DD） */
export function getAcademicYearRange(baseDate: Date = new Date()): { start: string; end: string } {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth() + 1
  if (month >= 4) {
    return { start: `${year}-04-01`, end: `${year + 1}-03-31` }
  }
  return { start: `${year - 1}-04-01`, end: `${year}-03-31` }
}

/** 年度開始年から範囲を得る。例: 2025 → 2025-04-01 〜 2026-03-31 */
export function getAcademicYearRangeByStartYear(startYear: number): { start: string; end: string } {
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` }
}

export function formatAcademicYearLabel(start: string, end: string): string {
  return `${start.slice(0, 4)}年4月〜${end.slice(0, 4)}年3月`
}
