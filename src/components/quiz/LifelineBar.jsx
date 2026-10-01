import { HugeiconsIcon } from '@hugeicons/react'
import { CrownIcon, EyeIcon, SplitIcon } from '@hugeicons/core-free-icons'
import CoinPill from '../ui/CoinPill'

const BUTTONS = [
  { kind: 'ask', label: 'Ask a GOAT', icon: CrownIcon },
  { kind: 'peek', label: 'Peek a Friend', icon: EyeIcon },
  { kind: 'fifty', label: '50-50', icon: SplitIcon },
]

export default function LifelineBar({ coins, usage, maxUses, onUse, onGetMore, disabled, needsAnswer }) {
  return (
    <div className="bg-white border-b border-[#EBEBEB]">
      <div className="max-w-md mx-auto px-4 py-2">
        <div className="flex justify-end mb-1.5">
          <CoinPill coins={coins} onGetMore={onGetMore} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BUTTONS.map(({ kind, label, icon }) => {
            const used = usage?.[kind] || 0
            const left = Math.max(0, maxUses - used)
            const out = left <= 0
            const gated = !!needsAnswer
            // Gated (no answer picked yet) stays tappable so the tap can show
            // the "Pick an answer first" hint instead of looking dead.
            const isDisabled = disabled || out
            return (
              <button
                key={kind}
                onClick={() => onUse(kind)}
                disabled={isDisabled}
                title={gated ? 'Pick an answer first' : undefined}
                className={`rounded-xl py-2 px-1 text-center transition-all active:scale-95 border ${
                  out
                    ? 'bg-[#F3F3F2] text-[#CCC] border-[#EBEBEB] cursor-not-allowed'
                    : gated
                      ? 'bg-white text-[#AAA] border-[#E5E5E5] cursor-not-allowed'
                      : 'bg-gradient-to-b from-[#1a1a1a] to-[#111] text-white border-[#111] hover:brightness-110 shadow-sm'
                }`}
              >
                <span className="inline-flex justify-center leading-none">
                  <HugeiconsIcon icon={icon} size={18} color={out || gated ? '#CCC' : '#F5C518'} />
                </span>
                <p className="text-[10px] font-bold font-label mt-0.5 leading-tight">{label}</p>
                <p className={`text-[9px] font-label ${out || gated ? 'text-[#CCC]' : 'text-white/50'}`}>
                  {out ? 'used up' : gated ? 'pick answer first' : `${left} left`}
                </p>
              </button>
            )
          })}
        </div>
        {needsAnswer && (
          <p className="text-[10px] text-[#888] font-label text-center mt-1.5">Pick an answer first to use a lifeline</p>
        )}
      </div>
    </div>
  )
}
