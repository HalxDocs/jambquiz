import { isRevisionCompleted, revisionTopicKey } from '../../lib/revisionQueue'

export default function WeakTopicsModal({ weakTopics, onRetake, onClose, patchesActive }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
          <p className="text-sm font-bold text-[#111] font-display">Weak Topics ({weakTopics.length})</p>
          <button onClick={onClose} className="text-[#888] hover:text-[#111] text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {weakTopics.length === 0 ? (
            <p className="text-xs text-[#AAA] font-label text-center py-8">No weak topics. Great job!</p>
          ) : (
            weakTopics.map((item) => {
              const key = revisionTopicKey(item.subject, item.week)
              const done = isRevisionCompleted(key)
              return (
                <div key={key} className={`border rounded-xl p-3 flex items-center gap-3 ${done ? 'border-green-200 opacity-60' : 'border-[#EBEBEB]'}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold font-label shrink-0 ${done ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {done ? '✓' : '↺'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#111] font-body">{item.subject}</p>
                    <p className="text-[11px] text-[#888] font-label">{item.week}</p>
                  </div>
                  {!done && (
                    <button
                      onClick={() => { if (!patchesActive) return; onRetake(item) }}
                      className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg font-label transition-colors ${patchesActive ? 'bg-[#111] text-white hover:bg-[#222] cursor-pointer' : 'bg-[#E5E5E5] text-[#AAA] cursor-not-allowed'}`}
                    >
                      {patchesActive ? 'Retake' : 'Locked'}
                    </button>
                  )}
                  {done && (
                    <span className="shrink-0 text-[10px] text-green-600 font-bold font-label">Done</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}