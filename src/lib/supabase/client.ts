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

export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createBrowserClient(url, anonKey, {
    auth: {
      lock: noopLock,
    },
  })
}
