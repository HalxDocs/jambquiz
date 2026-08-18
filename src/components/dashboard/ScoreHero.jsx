export default function ScoreHero({ total, totalOut, theme, onViewResults }) {
  if (total == null || totalOut == null) return null
  const pct = Math.round((total / totalOut) * 100)
  const label = total >= 250 ? 'Strong' : total >= 180 ? 'Average' : 'Needs work'
  const labelColor = total >= 250 ? 'text-green-400' : total >= 180 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className={`${theme.bg} text-white rounded-2xl p-5 mb-4`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.2em] font-label mb-1">Total Score</p>
          <div className="flex items-end gap-1.5">
            <span className="text-4xl font-bold font-display">{total}</span>
            <span className="text-white/40 text-sm mb-1 font-label">/ {totalOut}</span>
          </div>
        </div>
        <button onClick={onViewResults} className="text-[11px] font-semibold text-white/40 hover:text-white transition-colors font-label mt-1">View →</button>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1.5 mt-4">
        <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="flex justify-between mt-1.5">
        <p className="text-[10px] text-white/30 font-label">{pct}%</p>
        <p className={`text-[10px] font-semibold font-label ${labelColor}`}>{label}</p>
      </div>
    </div>
  )
}
