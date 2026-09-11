import CoinPill from '../ui/CoinPill'

const BUTTONS = [
  { kind: 'ask', label: 'Ask a GOAT', icon: '🐐' },
  { kind: 'peek', label: 'Peek a Friend', icon: '👀' },
  { kind: 'fifty', label: '50-50', icon: '✂️' },
]

export default function LifelineBar({ coins, usage, maxUses, onUse, onGetMore, disabled }) {
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
            return (
              <button
                key={kind}
                onClick={() => onUse(kind)}
                disabled={disabled || out}
                className={`rounded-xl py-2 px-1 text-center transition-all active:scale-95 border ${
                  out
                    ? 'bg-[#F3F3F2] text-[#CCC] border-[#EBEBEB] cursor-not-allowed'
                    : 'bg-gradient-to-b from-[#1a1a1a] to-[#111] text-white border-[#111] hover:brightness-110 shadow-sm'
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                <p className="text-[10px] font-bold font-label mt-0.5 leading-tight">{label}</p>
                <p className={`text-[9px] font-label ${out ? 'text-[#CCC]' : 'text-white/50'}`}>
                  {out ? 'used up' : `${left} left`}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
