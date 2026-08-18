import { useState, useEffect } from 'react'

const CARD_YELLOW_1 = 2
const CARD_YELLOW_2 = 4
const CARD_RED = 6

export default function CardWarningPopup({ missedStreak = 0, isNewRegistration = false, onDismiss }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(false); onDismiss?.() }, isNewRegistration ? 12000 : 10000)
    return () => clearTimeout(timer)
  }, [onDismiss, isNewRegistration])

  if (!visible) return null

  const isRed = missedStreak >= CARD_RED

  if (isNewRegistration) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-sm bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 text-center relative">
          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="absolute top-3 right-3 text-[#666] hover:text-white text-xs"
          >
            ✕
          </button>

          <h2 className="text-lg font-bold text-white font-display mb-4 mt-1">Attendance Rules</h2>

          <div className="flex justify-center gap-2 mb-4">
            <div className="w-10 h-14 rounded-lg border-2 border-yellow-500 bg-yellow-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-yellow-400">1</span>
            </div>
            <div className="w-10 h-14 rounded-lg border-2 border-amber-500 bg-amber-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-amber-400">2</span>
            </div>
            <div className="w-10 h-14 rounded-lg border-2 border-red-500 bg-red-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-red-400">3</span>
            </div>
          </div>

          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm">1</span>
              <span className="text-xs text-[#888] font-label">Miss 2 weeks = Yellow card (Warning)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">2</span>
              <span className="text-xs text-[#888] font-label">Miss 2 more = Yellow card (Final Warning)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-sm">3</span>
              <span className="text-xs text-[#888] font-label">Miss 2 more = Red card (Account Suspended)</span>
            </div>
          </div>

          <p className="text-xs text-[#666] font-label mb-4">
            Take weekly tests on time to avoid suspension. Suspended accounts can reactivate with recovery code or pay N800 to resume.
          </p>

          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="w-full bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display"
          >
            I Understand
          </button>
        </div>
      </div>
    )
  }

  const isYellow1 = missedStreak >= CARD_YELLOW_1 && missedStreak < CARD_YELLOW_2
  const isYellow2 = missedStreak >= CARD_YELLOW_2 && missedStreak < CARD_RED

  if (isYellow1 || isYellow2) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-sm bg-yellow-950 border border-yellow-800 rounded-2xl p-6 text-center relative">
          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="absolute top-3 right-3 text-[#666] hover:text-white text-xs"
          >
            ✕
          </button>

          <h2 className="text-lg font-bold text-yellow-400 font-display mb-2 mt-1">HEADS UP! YELLOW WARNING</h2>

          <p className="text-xs text-[#888] font-label leading-relaxed mb-4">
            You missed last test. Take next test to clear Yellow card or miss and it becomes active.
          </p>

          {isYellow2 && (
            <p className="text-xs text-amber-400 font-label mb-4">
              One more miss = account suspended
            </p>
          )}

          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl py-3 text-sm font-bold active:scale-[0.99] transition-all font-display"
          >
            Take Tests On Time
          </button>
        </div>
      </div>
    )
  }

  if (isRed) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-sm bg-red-950 border border-red-800 rounded-2xl p-6 text-center relative">
          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="absolute top-3 right-3 text-[#666] hover:text-white text-xs"
          >
            ✕
          </button>

          <h2 className="text-lg font-bold text-red-400 font-display mb-2 mt-1">Account Suspended</h2>

          <p className="text-xs text-[#888] font-label leading-relaxed mb-4">
            Your account has been suspended. You cannot take quizzes or access key points until you reactivate.
          </p>

          <button
            onClick={() => { setVisible(false); onDismiss?.() }}
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-3 text-sm font-bold active:scale-[0.99] transition-all font-display"
          >
            Okay
          </button>
        </div>
      </div>
    )
  }

  return null
}
