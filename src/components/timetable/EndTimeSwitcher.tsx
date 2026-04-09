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
    <div className="mb-3 space-y-3 p-3 bg-purple-50 rounded-xl">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-purple-700 font-medium">終了時間モード</span>
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
          <span className="text-xs text-purple-700">昼休み枠</span>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'UPSERT_DAY_SETTINGS',
                payload: { ...settings, lunchBreakOpen: !settings.lunchBreakOpen },
              })
            }
            className={cn(
              'relative inline-flex h-5 w-9 rounded-full transition-colors',
              settings.lunchBreakOpen ? 'bg-purple-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'pointer-events-none absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200',
                settings.lunchBreakOpen ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
          <span className="text-xs text-purple-600">{settings.lunchBreakOpen ? '開放' : '休み'}</span>
        </div>
      </div>
      <div>
        <label htmlFor="day-default-room" className="text-xs text-purple-700 font-medium block mb-1">
          デフォルト教室
        </label>
        <input
          id="day-default-room"
          type="text"
          value={settings.defaultRoom}
          onChange={(e) =>
            dispatch({
              type: 'UPSERT_DAY_SETTINGS',
              payload: { ...settings, defaultRoom: e.target.value },
            })
          }
          className="w-full max-w-md border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
          placeholder="例: 1号館120"
          autoComplete="off"
        />
      </div>
    </div>
  )
}
