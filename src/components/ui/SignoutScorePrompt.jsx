import { useState } from 'react'

const SCORE_RANGES = ['Above 300', '250-300', '200-250', 'Below 200']

export default function SignoutScorePrompt({ onCancel, onSignOut }) {
  const [scoreRange, setScoreRange] = useState('')
  const [showCongrats, setShowCongrats] = useState(false)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-score-title"
        className="w-full max-w-sm rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-2xl"
      >
        {showCongrats ? (
          <>
            <h2 id="signout-score-title" className="text-lg font-bold text-[#111] font-display">
              Well done and Congrats in advance on your admission
            </h2>
            <p className="mt-2 text-sm text-[#777] font-label">
              Keep practising — we’ll be here when you’re ready to come back.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-sm font-semibold text-[#555] font-label"
              >
                Stay logged in
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="flex-1 rounded-xl bg-[#111] px-4 py-2.5 text-sm font-bold text-white font-label"
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="signout-score-title" className="text-lg font-bold text-[#111] font-display">
              What score are you aiming for in JAMB?
            </h2>
            <p className="mt-1 text-sm text-[#777] font-label">Choose a score range before you log out.</p>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">JAMB score range</legend>
              {SCORE_RANGES.map((range) => (
                <label
                  key={range}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold font-label transition-colors ${
                    scoreRange === range
                      ? 'border-[#111] bg-[#F5F5F5] text-[#111]'
                      : 'border-[#E5E5E5] text-[#555] hover:border-[#AAA]'
                  }`}
                >
                  <input
                    type="radio"
                    name="jamb-score-range"
                    value={range}
                    checked={scoreRange === range}
                    onChange={() => setScoreRange(range)}
                    className="accent-[#111]"
                  />
                  {range}
                </label>
              ))}
            </fieldset>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-sm font-semibold text-[#555] font-label"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!scoreRange}
                onClick={() => setShowCongrats(true)}
                className="rounded-xl bg-[#111] px-5 py-2.5 text-sm font-bold text-white font-label disabled:cursor-not-allowed disabled:opacity-40"
              >
                OK
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
