export default function PatchesOverlay({ currentIdx, total, subject, point, onNext, onDeactivate }) {
  if (!point) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-red-700 text-white rounded-2xl p-5 shadow-2xl pointer-events-auto">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-[10px] font-bold text-red-300 uppercase tracking-widest font-label">
              Key Point {currentIdx + 1}/{total}
            </p>
            <p className="text-[11px] font-semibold text-red-200 font-label mt-0.5">{subject}</p>
          </div>
          <button onClick={onNext} className="text-red-300 hover:text-white text-xs font-bold font-label transition-colors">
            Next →
          </button>
        </div>
        <p className="text-sm font-semibold leading-relaxed font-body mb-4">{point}</p>
        <button
          onClick={onDeactivate}
          className="w-full bg-red-900 text-red-300 rounded-xl py-2.5 text-xs font-bold font-label hover:bg-red-950 transition-colors"
        >
          Deactivate Patches
        </button>
      </div>
    </div>
  )
}
