/**
 * 簡易認証：先生が登録した名簿のユーザーのみがメール・パスワードでログイン可能。
 * 認証情報は localStorage に保存（本番では Supabase Auth 等への移行を推奨）。
 */

const CREDENTIALS_KEY = 'lessonapp_credentials'

export type StoredCredentials = Record<string, { email: string; passwordHash: string }>

function getStorage(): StoredCredentials {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as StoredCredentials
  } catch {
    return {}
  }
}

function setStorage(data: StoredCredentials): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

/** パスワードを SHA-256 でハッシュ（プレーンテキスト保存を避けるため） */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 指定ユーザーが登録済みか */
export function isRegistered(userId: string): boolean {
  const cred = getStorage()[userId]
  return !!cred?.email
}

/** メールでユーザーIDを検索 */
export function getUserIdByEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  const data = getStorage()
  for (const [userId, c] of Object.entries(data)) {
    if (c.email.trim().toLowerCase() === normalized) return userId
  }
  return null
}

/** ログイン検証：メール・パスワードが正しければ userId を返す */
export async function validateLogin(email: string, password: string): Promise<string | null> {
  const userId = getUserIdByEmail(email)
  if (!userId) return null
  const stored = getStorage()[userId]
  if (!stored) return null
  const hash = await hashPassword(password)
  return hash === stored.passwordHash ? userId : null
}

/** 初回登録：ユーザーIDにメール・パスワードを紐付けて保存 */
export async function registerCredentials(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  const data = getStorage()
  const emailNorm = email.trim()
  const passwordHash = await hashPassword(password)
  data[userId] = { email: emailNorm, passwordHash }
  setStorage(data)
}
