import { motion } from 'framer-motion'
import { HugeiconsIcon } from '@hugeicons/react'
import { CrownIcon, Coins01Icon } from '@hugeicons/core-free-icons'

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
  const list = Array.isArray(goats) ? goats : []
  const rated = list.filter((g) => (g.stars?.[subject] || 0) > 0)
  return (
    <Sheet onClose={onClose}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center">Ask a GOAT · {subject}</p>
      <h3 className="text-base font-bold text-[#111] font-display text-center mt-1 mb-4">Who do you trust?</h3>
      {list.length === 0 ? (
        <p className="text-xs text-[#888] font-label text-center py-4">No GOATs assigned for this week yet — try 50-50 instead.</p>
      ) : rated.length === 0 ? (
        <p className="text-xs text-[#888] font-label text-center py-4">None of this week's GOATs cover {subject} — try 50-50 instead.</p>
      ) : (
      <div className="space-y-2">
        {rated.map((g) => {
          const stars = g.stars?.[subject] || 0
          const comment = ((g.comments || {})[subject] || '').trim()
          return (
            <button
              key={g.id}
              onClick={() => onPick(g)}
              disabled={!!busyId}
              className="w-full border border-[#EBEBEB] rounded-2xl p-3.5 hover:border-[#111] active:scale-[0.99] transition-all text-left disabled:opacity-60"
            >
              <span className="w-full flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={CrownIcon} size={20} color="#B87010" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[#111] font-display truncate">{g.name}</span>
                  <span className="block text-[11px] text-[#888] font-label truncate">{g.profession || 'Expert'} · {stars}-star</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#111] text-white px-2.5 py-1.5 rounded-lg font-label shrink-0">
                  {busyId === g.id ? '…' : (<><HugeiconsIcon icon={Coins01Icon} size={12} color="#F5C518" />{COST[stars]}</>)}
                </span>
              </span>
              {comment ? (
                <span className="block mt-2.5 bg-[#F8F8F7] border border-[#F1F1F0] rounded-xl px-3 py-2 text-xs text-[#555] font-body leading-relaxed whitespace-normal">
                  <span className="font-bold text-[#111]">{g.name.split(' ')[0]}: </span>“{comment}”
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      )}
      <button onClick={onClose} className="w-full mt-3 text-xs text-[#AAA] font-label py-2">Cancel</button>
    </Sheet>
  )
}

export function GoatResult({ goatName, stars, subject, explanation, explanationImage, shownOptions, questionOptions, onDone }) {
  // 3-star shows the QUESTION explanation (written by admin with the
  // question/options). 2/1-star shows the GOAT's narrowed options.
  // The GOAT comment was already shown inline in the picker list.
  return (
    <Sheet onClose={onDone}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center">{goatName} Answer:</p>
      {stars === 3 ? (
        <div className="mt-3 bg-[#FFFBEB] border border-amber-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-black uppercase tracking-widest font-label mb-1.5">Explanation</p>
          <p className="text-sm text-black font-body leading-relaxed whitespace-pre-line">
            {explanation || 'Trust your preparation on this one — eliminate the obviously wrong options first.'}
          </p>
          {explanationImage ? (
            <img src={explanationImage} alt="Explanation" className="mt-2.5 w-full rounded-xl border border-amber-200" />
          ) : null}
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
