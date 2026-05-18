export default function PatchesModal({ subjects, selected, onToggle, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl">
        <h3 className="text-base font-bold font-display text-[#111] mb-1">Activate My Patches</h3>
        <p className="text-xs text-[#888] font-label mb-4">
          Select weak topics to receive daily key point notifications:
        </p>
        <div className="space-y-2 mb-5">
          {subjects.map((sub) => (
            <label
              key={sub}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selected.includes(sub) ? 'border-red-200 bg-red-50' : 'border-[#EBEBEB] hover:border-[#CCC]'
              }`}
            >
              <input type="checkbox" checked={selected.includes(sub)} onChange={() => onToggle(sub)} className="w-4 h-4 accent-red-600" />
              <span className="text-sm font-semibold text-[#111] font-body">{sub}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 bg-[#F3F3F2] text-[#888] rounded-xl py-3 text-sm font-bold font-label hover:bg-[#E5E5E5] transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={selected.length === 0}
            className={`flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors ${
              selected.length === 0 ? 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed' : 'bg-red-700 text-white hover:bg-red-800'
            }`}
          >
            Activate →
          </button>
        </div>
      </div>
    </div>
  )
}
