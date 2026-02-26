'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** 先生の新規登録は行いません（大和田門下専用のため）。トップへリダイレクト */
export default function RegisterPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )
}
