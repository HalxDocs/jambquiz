export default function KeyPointsCard({ point, current, total, theme, onDismiss }) {
  if (!point) return null
  return (
    <div className={`${theme.bg} text-white rounded-2xl p-4 mb-4 flex items-start gap-3`}>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest font-label mb-0.5">
          Study Point · {point.subject}
        </p>
        <p className="text-sm font-semibold font-body leading-snug">{point.point}</p>
        {total > 1 && <p className="text-[10px] text-white/40 font-label mt-1">{current + 1} / {total}</p>}
      </div>
      <button onClick={onDismiss} className="text-white/40 hover:text-white text-lg leading-none shrink-0 transition-colors">×</button>
    </div>
  )
}
