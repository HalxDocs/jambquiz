import ScorePill from '../ui/ScorePill'
import ProgressBar from '../ui/ProgressBar'

export default function SubjectCard({ subject, pct, patchesActive, isWeak, onClick }) {
  const borderColor = patchesActive && isWeak ? 'border-red-200' : 'border-[#EBEBEB] hover:border-[#111]'
  const barColor = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'

  return (
    <button
      onClick={onClick}
      className={`bg-white border rounded-xl p-3.5 text-left hover:shadow-sm active:scale-[0.98] transition-all group ${borderColor}`}
    >
      <p className="text-[10px] font-semibold text-[#AAA] uppercase tracking-wide font-label mb-1">Subject</p>
      <p className="text-xs font-bold text-[#111] leading-snug font-body mb-2">{subject}</p>
      {pct !== null ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <ScorePill pct={pct} />
            <p className="text-[10px] text-[#CCC] font-label group-hover:text-[#111] transition-colors">→</p>
          </div>
          <ProgressBar value={pct} max={100} fill={barColor} height="h-1" />
        </div>
      ) : (
        <p className="text-[10px] text-[#CCC] font-label">No test yet →</p>
      )}
    </button>
  )
}
