'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* panel: モバイルで画面内に収め、スクロール可能に */}
      <div
        className={cn(
          'relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-[100vw] max-h-[80dvh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden',
          'min-h-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]',
          {
            'sm:max-w-sm': size === 'sm',
            'sm:max-w-lg': size === 'md',
            'sm:max-w-2xl': size === 'lg',
          }
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5 pb-2 sm:pb-3 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate pr-8">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0 absolute top-3 right-3 sm:top-4 sm:right-4">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-4 sm:p-5 min-w-0">{children}</div>
      </div>
    </div>
  )
}
