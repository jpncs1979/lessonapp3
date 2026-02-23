import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: 'レッスン可',
    pending: '承認待ち',
    confirmed: '確定',
    break: '休憩',
    lunch: '昼休み',
    blocked: '不可',
  }
  return labels[status] || status
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    available: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    confirmed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    break: 'bg-gray-100 text-gray-500 border-gray-200',
    lunch: 'bg-orange-50 text-orange-600 border-orange-200',
    blocked: 'bg-red-50 text-red-400 border-red-200',
  }
  return colors[status] || 'bg-gray-100 text-gray-500'
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    teacher: '先生',
    student: '生徒',
    accompanist: '伴奏者',
  }
  return labels[role] || role
}

export function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    teacher: 'bg-purple-100 text-purple-800',
    student: 'bg-blue-100 text-blue-800',
    accompanist: 'bg-teal-100 text-teal-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

export function getInitials(name: string): string {
  // 日本語名の場合は先頭2文字
  if (/[\u3000-\u9fff]/.test(name)) {
    const parts = name.trim().split(/[\s　]+/)
    if (parts.length >= 2) return parts[0][0] + parts[1][0]
    return name.substring(0, 2)
  }
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

export function calcProvisionalDeadline(hours: 24 | 48): string {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

export function formatDeadline(deadline?: string): string {
  if (!deadline) return ''
  const d = new Date(deadline)
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + 'まで'
}

export function isExpired(deadline?: string): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

/** 先生の名前から「〇〇門下」を生成（例: 大和田 智彦 → 大和田門下） */
export function getTeacherGroupLabel(teacherName: string): string {
  const parts = teacherName.trim().split(/[\s　]+/)
  const lastName = parts[0] || teacherName
  return `${lastName}門下`
}
