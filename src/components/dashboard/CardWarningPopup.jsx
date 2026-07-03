import { useState, useEffect } from 'react'

const CARD_YELLOW_1 = 1
const CARD_YELLOW_2 = 2
const CARD_RED = 3

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
              <span className="text-xs text-[#888] font-label">1st missed test = Yellow Card (Warning)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">2</span>
              <span className="text-xs text-[#888] font-label">2nd missed test = Yellow Card (Final Warning)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-sm">3</span>
              <span className="text-xs text-[#888] font-label">3rd missed test = Red Card (Account Suspended)</span>
            </div>
          </div>

          <p className="text-xs text-[#666] font-label mb-4">
            Take tests on time to avoid suspension. Suspended accounts must pay N800 to resume.
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

  const isYellow1 = missedStreak === CARD_YELLOW_1
  const isYellow2 = missedStreak === CARD_YELLOW_2
  const remaining = CARD_RED - missedStreak

  const title = isRed ? 'Account Suspended' : isYellow2 ? 'Final Warning' : 'Attendance Warning'
  const color = isRed ? 'red' : isYellow2 ? 'amber' : 'yellow'
  const bg = isRed ? 'bg-red-950' : isYellow2 ? 'bg-amber-950' : 'bg-yellow-950'
  const border = isRed ? 'border-red-800' : isYellow2 ? 'border-amber-800' : 'border-yellow-800'
  const text = isRed ? 'text-red-400' : isYellow2 ? 'text-amber-400' : 'text-yellow-400'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
      <div className={`w-full max-w-sm ${bg} border ${border} rounded-2xl p-6 text-center relative`}>
        <button
          onClick={() => { setVisible(false); onDismiss?.() }}
          className="absolute top-3 right-3 text-[#666] hover:text-white text-xs"
        >
          ✕
        </button>

        <div className="flex justify-center gap-2 mb-4 mt-1">
          <div className={`w-10 h-14 rounded-lg border-2 ${missedStreak >= 1 ? (isRed ? 'border-red-500 bg-red-500/20' : 'border-yellow-500 bg-yellow-500/20') : 'border-[#333] bg-[#1a1a1a]'} flex items-center justify-center`}>
            <span className={`text-lg font-bold ${missedStreak >= 1 ? text : 'text-[#444]'}`}>1</span>
          </div>
          <div className={`w-10 h-14 rounded-lg border-2 ${missedStreak >= 2 ? (isRed ? 'border-red-500 bg-red-500/20' : 'border-amber-500 bg-amber-500/20') : 'border-[#333] bg-[#1a1a1a]'} flex items-center justify-center`}>
            <span className={`text-lg font-bold ${missedStreak >= 2 ? (isRed ? 'text-red-400' : 'text-amber-400') : 'text-[#444]'}`}>2</span>
          </div>
          <div className={`w-10 h-14 rounded-lg border-2 ${missedStreak >= 3 ? 'border-red-500 bg-red-500/20' : 'border-[#333] bg-[#1a1a1a]'} flex items-center justify-center`}>
            <span className={`text-lg font-bold ${missedStreak >= 3 ? 'text-red-400' : 'text-[#444]'}`}>3</span>
          </div>
        </div>

        <h2 className={`text-lg font-bold ${text} font-display mb-2`}>{title}</h2>

        {isRed ? (
          <p className="text-xs text-[#888] font-label leading-relaxed mb-4">
            Your account has been suspended. You cannot take quizzes or access key points until you reactivate.
          </p>
        ) : (
          <p className="text-xs text-[#888] font-label leading-relaxed mb-4">
            You've missed {missedStreak} test{missedStreak > 1 ? 's' : ''}. Miss {remaining} more and your account will be suspended.
          </p>
        )}

        {isYellow2 && (
          <p className="text-xs text-amber-400 font-label mb-4">
            ⚠️ One more miss = account suspended
          </p>
        )}

        <button
          onClick={() => { setVisible(false); onDismiss?.() }}
          className={`w-full ${isRed ? 'bg-red-600 hover:bg-red-700' : isYellow2 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-yellow-600 hover:bg-yellow-700'} text-white rounded-xl py-3 text-sm font-bold active:scale-[0.99] transition-all font-display`}
        >
          {isRed ? 'Okay' : 'Take Tests On Time'}
        </button>
      </div>
    </div>
  )
}
