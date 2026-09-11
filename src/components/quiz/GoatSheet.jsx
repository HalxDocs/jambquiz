import { motion } from 'framer-motion'

const COST = { 3: 10, 2: 6, 1: 2 }

function Sheet({ children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export function GoatPicker({ goats, subject, busyId, onPick, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center">Ask a GOAT · {subject}</p>
      <h3 className="text-base font-bold text-[#111] font-display text-center mt-1 mb-4">Who do you trust?</h3>
      <div className="space-y-2">
        {goats.map((g) => {
          const stars = g.stars?.[subject] || 0
          if (!stars) return null
          return (
            <button
              key={g.id}
              onClick={() => onPick(g)}
              disabled={!!busyId}
              className="w-full flex items-center gap-3 border border-[#EBEBEB] rounded-2xl p-3.5 hover:border-[#111] active:scale-[0.99] transition-all text-left disabled:opacity-60"
            >
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-xl shrink-0">🐐</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-[#111] font-display truncate">{g.name}</span>
                <span className="block text-[11px] text-[#888] font-label truncate">{g.profession || 'Expert'} · {'⭐'.repeat(stars)}</span>
              </span>
              <span className="text-[11px] font-bold bg-[#111] text-white px-2.5 py-1.5 rounded-lg font-label shrink-0">
                {busyId === g.id ? '…' : `🪙${COST[stars]}`}
              </span>
            </button>
          )
        })}
      </div>
      <button onClick={onClose} className="w-full mt-3 text-xs text-[#AAA] font-label py-2">Cancel</button>
    </Sheet>
  )
}

export function GoatResult({ goatName, stars, subject, explanation, shownOptions, questionOptions, onDone }) {
  return (
    <Sheet onClose={onDone}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center">{goatName} Answer:</p>
      {stars === 3 ? (
        <div className="mt-3 bg-[#FFFBEB] border border-amber-200 rounded-2xl p-4">
          <p className="text-sm text-[#111] font-body leading-relaxed">
            {explanation || 'Trust your preparation on this one — eliminate the obviously wrong options first.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-[#888] font-label text-center">
            {goatName} narrows it down — pick your answer:
          </p>
          {(shownOptions || []).map((optIdx) => (
            <div key={optIdx} className="border border-[#E5E5E5] rounded-xl px-3.5 py-3 text-sm text-[#111] font-body bg-[#F8F8F7]">
              <span className="font-bold mr-2">{String.fromCharCode(65 + optIdx)}.</span>
              {questionOptions?.[optIdx]}
            </div>
          ))}
        </div>
      )}
      <button onClick={onDone}
        className="w-full mt-4 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.99] transition-all">
        Got it — pick my answer
      </button>
    </Sheet>
  )
}
