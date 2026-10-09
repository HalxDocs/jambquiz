import { useState } from 'react'
import { RESET_FLAG, openPasswordReset } from '../../lib/api'

const SEEN_KEY = 'server_move_seen'

// Slim announcement bar. Dark variant matches the marketing page,
// light variant sits on the sign-in card.
export default function ServerMoveBanner({ setView, setHomeMode, dark }) {
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(SEEN_KEY) === '1' } catch { /* non-fatal */ return true }
  })
  if (seen) return null
  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* non-fatal */ }
    setSeen(true)
  }
  if (dark) {
    return (
      <div className="mx-auto max-w-[720px] px-5 pt-20">
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">
          <span className="text-lg shrink-0">⚡</span>
          <p className="flex-1 text-xs text-amber-100/90 font-label leading-relaxed">
            <strong className="text-amber-200">We moved to faster servers to serve you better.</strong>{' '}
            Returning users, please reset your password (30 seconds). Thank you for your understanding.
          </p>
          <button
            onClick={() => { dismiss(); openPasswordReset(setView, setHomeMode) }}
            className="shrink-0 text-[11px] font-bold bg-amber-400 text-neutral-950 px-3 py-1.5 rounded-full hover:bg-amber-300 transition-colors font-label"
          >
            Reset →
          </button>
          <button onClick={dismiss} className="shrink-0 text-neutral-500 hover:text-white text-base leading-none px-1">×</button>
        </div>
      </div>
    )
  }
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0">⚡</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-amber-900 font-label">We moved to faster servers to serve you better</p>
          <p className="text-[11px] text-amber-800 font-label mt-0.5 leading-relaxed">
            Returning users, please reset your password (30 seconds). Thank you for your understanding.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => openPasswordReset(setView, setHomeMode)}
              className="text-[11px] font-bold bg-[#111] text-white px-3 py-1.5 rounded-lg hover:bg-[#222] transition-colors font-label"
            >
              Reset password →
            </button>
            <button onClick={dismiss} className="text-[11px] text-amber-700 hover:text-amber-900 font-label">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
