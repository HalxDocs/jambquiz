import { revisionTopicKey } from '../../lib/revisionQueue'

export default function PatchTopicsModal({ topics, onCorrection, onRetake, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB]">
          <p className="text-sm font-bold text-[#111] font-display">My Topics to Patch ({topics.length})</p>
          <button onClick={onClose} className="text-[#888] hover:text-[#111] text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {topics.length === 0 ? (
            <p className="text-xs text-[#AAA] font-label text-center py-8">No topics to patch. Great job!</p>
          ) : (
            topics.map((item) => {
              const key = revisionTopicKey(item.subject, item.week)
              const canRetake = Array.isArray(item.questions) && item.questions.length > 0
              return (
                <div key={key} className="border border-[#EBEBEB] rounded-xl p-3">
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold font-label shrink-0 bg-red-50 text-red-600">
                      {item.pct}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#111] font-body truncate">{item.subject}</p>
                      <p className="text-[11px] text-[#888] font-label truncate">{item.topicName}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onCorrection(item)}
                      className="flex-1 text-[11px] font-bold px-3 py-2 rounded-lg font-label border border-[#E5E5E5] text-[#555] bg-white hover:border-[#111] hover:text-[#111] transition-colors"
                    >
                      correction
                    </button>
                    <button
                      onClick={() => { if (canRetake) onRetake(item) }}
                      disabled={!canRetake}
                      className={`flex-1 text-[11px] font-bold px-3 py-2 rounded-lg font-label transition-colors ${canRetake ? 'bg-[#111] text-white hover:bg-[#222]' : 'bg-[#F3F3F2] text-[#CCC] cursor-not-allowed'}`}
                    >
                      retake
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
