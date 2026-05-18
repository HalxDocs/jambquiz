export default function RankToast({ rank, onDismiss }) {
  if (!rank) return null
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm">
      <div className="bg-[#111] text-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3">
        <span className="text-2xl">⚡</span>
        <div className="flex-1">
          <p className="text-sm font-bold font-display">Rank Up!</p>
          <p className="text-xs text-[#888] font-label mt-0.5">
            Consistency Rank: <span className="text-white font-semibold">{rank}</span>
          </p>
        </div>
        <button onClick={onDismiss} className="text-[#666] hover:text-white text-lg leading-none transition-colors">×</button>
      </div>
    </div>
  )
}
