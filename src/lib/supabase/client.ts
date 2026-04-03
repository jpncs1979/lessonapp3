import { createBrowserClient } from '@supabase/ssr'

/**
 * auth-js の lock: (name, acquireTimeout, fn) => Promise<R>
 * LockManager のタイムアウトを避けるため、fn をそのまま実行する noop を渡す。
 */
const noopLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> => fn()

/**
 * GoTrue がリフレッシュ失敗時に console.error する（ライブラリ実装）。
 * Next.js dev のオーバーレイがそれをエラー扱いするため、想定内の無効トークン系だけ抑止する。
 * （sync の isStaleAuthSessionError と同等の判定・client から sync を import しない）
 */
function isExpectedStaleAuthLogObject(arg: unknown): boolean {
  if (arg == null || typeof arg !== 'object') return false
  const msg =
    'message' in arg && typeof (arg as { message: unknown }).message === 'string'
      ? (arg as { message: string }).message
      : ''
  const code =
    'code' in arg && typeof (arg as { code: unknown }).code === 'string'
      ? (arg as { code: string }).code
      : ''
  return (
    code === 'refresh_token_not_found' ||
    /refresh token|invalid.*token|session.*expired|jwt expired|session missing/i.test(msg)
  )
}

function shouldSuppressStaleAuthConsoleArgs(args: unknown[]): boolean {
  if (args.length === 0) return false
  const a0 = args[0]
  const a1 = args[1]
  if (isExpectedStaleAuthLogObject(a0)) return true
  if (
    typeof a0 === 'string' &&
    (a0.includes('Auto refresh tick failed') || a0.includes('_handleVisibilityChange')) &&
    isExpectedStaleAuthLogObject(a1)
  ) {
    return true
  }
  return false
}

let staleAuthConsoleFilterInstalled = false

function installStaleAuthConsoleFilterOnce() {
  if (typeof window === 'undefined' || staleAuthConsoleFilterInstalled) return
  staleAuthConsoleFilterInstalled = true
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (shouldSuppressStaleAuthConsoleArgs(args)) return
    orig(...args)
  }
}

export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  installStaleAuthConsoleFilterOnce()
  return createBrowserClient(url, anonKey, {
    auth: {
      lock: noopLock,
    },
  })
}
