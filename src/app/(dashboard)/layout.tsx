'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/store'
import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { state } = useApp()

  useEffect(() => {
    if (!state.sessionRestoreDone) return
    if (!state.currentUser) router.push('/')
  }, [state.sessionRestoreDone, state.currentUser, router])

  if (!state.sessionRestoreDone || !state.currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="h-dvh max-h-dvh flex flex-col overflow-hidden bg-gray-50 md:min-h-screen md:max-h-none">
      <Sidebar />
      <main className="flex-1 min-h-0 md:pl-56 pb-16 md:pb-0 overflow-x-hidden overflow-y-auto min-w-0">
        <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6 w-full min-w-0 box-border">
          {children}
        </div>
      </main>
    </div>
  )
}
