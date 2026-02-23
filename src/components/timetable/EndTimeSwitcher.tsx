'use client'

import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DaySettings, EndTimeMode } from '@/types'

interface Props {
  settings: DaySettings
}

export default function EndTimeSwitcher({ settings }: Props) {
  const { dispatch } = useApp()

  const toggle = (mode: EndTimeMode) => {
    dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: { ...settings, endTimeMode: mode } })
  }

  return (
    <div className="mb-3 flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
      <span className="text-xs text-purple-700 font-medium flex-1">終了時間モード</span>
      <div className="flex rounded-lg overflow-hidden border border-purple-200">
        {(['16:30', '20:00'] as EndTimeMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => toggle(mode)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              settings.endTimeMode === mode
                ? 'bg-purple-600 text-white'
                : 'bg-white text-purple-600 hover:bg-purple-50'
            )}
          >
            〜{mode}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-purple-700">昼休み</span>
        <button
          onClick={() => dispatch({ type: 'UPSERT_DAY_SETTINGS', payload: { ...settings, lunchBreakOpen: !settings.lunchBreakOpen } })}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors',
            settings.lunchBreakOpen ? 'bg-purple-600' : 'bg-gray-300'
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
            settings.lunchBreakOpen ? 'translate-x-4' : 'translate-x-0.5'
          )} />
        </button>
        <span className="text-xs text-purple-600">{settings.lunchBreakOpen ? '開放' : '休み'}</span>
      </div>
    </div>
  )
}
