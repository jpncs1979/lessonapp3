'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BookingsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/calendar')
  }, [router])
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-gray-400">カレンダーへ移動しています…</p>
    </div>
  )
}
