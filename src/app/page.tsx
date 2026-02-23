'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const { state } = useApp()

  useEffect(() => {
    if (state.currentUser) {
      router.push('/calendar')
    } else {
      router.push('/register')
    }
  }, [state.currentUser, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  )
}
