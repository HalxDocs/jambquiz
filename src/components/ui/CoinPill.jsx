import { HugeiconsIcon } from '@hugeicons/react'
import { Coins01Icon } from '@hugeicons/core-free-icons'

export default function CoinPill({ coins, onGetMore, dark }) {
  return (
    <button
      onClick={onGetMore}
      className={`flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-bold font-label transition-all active:scale-95 ${
        dark
          ? 'bg-white/10 text-white hover:bg-white/20'
          : 'bg-[#111] text-white hover:bg-[#222]'
      }`}
      title="Your coins — tap to get more"
    >
      <HugeiconsIcon icon={Coins01Icon} size={16} color="#F5C518" />
      <span className="font-display">{coins ?? '—'}</span>
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${dark ? 'bg-white text-[#111]' : 'bg-white/20 text-white'}`}>
        Get more
      </span>
    </button>
  )
}
