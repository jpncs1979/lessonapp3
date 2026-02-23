/**
 * 簡易認証：先生が登録した名簿のユーザーのみがメール・パスワードでログイン可能。
 * 認証情報は localStorage に保存（本番では Supabase Auth 等への移行を推奨）。
 */

const CREDENTIALS_KEY = 'lessonapp_credentials'

export type CredentialEntry = { email: string; passwordHash: string; emailConfirmed?: boolean }
export type StoredCredentials = Record<string, CredentialEntry>

function getStorage(): StoredCredentials {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, { email: string; passwordHash: string; emailConfirmed?: boolean }>
    return parsed
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

/** 生徒がメールアドレス確認済みか（1回でもメール・パスワードでログイン済みなら true） */
export function isEmailConfirmed(userId: string): boolean {
  const cred = getStorage()[userId]
  return !!cred?.emailConfirmed
}

/** メール・パスワードでログイン成功時に、そのユーザーを「アドレス確認済み」にする */
export function setEmailConfirmed(userId: string): void {
  const data = getStorage()
  const c = data[userId]
  if (c) {
    data[userId] = { ...c, emailConfirmed: true }
    setStorage(data)
  }
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
  if (hash !== stored.passwordHash) return null
  setEmailConfirmed(userId)
  return userId
}

/** 初回登録：ユーザーIDにメール・パスワードを紐付けて保存（アドレス確認は初回メール・パスワードログイン時に付与） */
export async function registerCredentials(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  const data = getStorage()
  const emailNorm = email.trim()
  const passwordHash = await hashPassword(password)
  data[userId] = { email: emailNorm, passwordHash, emailConfirmed: false }
  setStorage(data)
}
