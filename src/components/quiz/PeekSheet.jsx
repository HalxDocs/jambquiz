import { motion } from 'framer-motion'
import { HugeiconsIcon } from '@hugeicons/react'
import { EyeIcon, Coins01Icon } from '@hugeicons/core-free-icons'

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

export function PeekPicker({ friends, busyId, onPick, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center inline-flex items-center gap-1 justify-center w-full">Peek a Friend · <HugeiconsIcon icon={Coins01Icon} size={12} color="#B87010" />2</p>
      <h3 className="text-base font-bold text-[#111] font-display text-center mt-1 mb-4">Whose paper?</h3>
      {friends.length === 0 ? (
        <p className="text-xs text-[#888] font-label text-center py-4">No peek friends locked for this test — add a squad before your next test to use Peek a Friend.</p>
      ) : (
        <div className="space-y-2">
          {friends.map((f) => (
            <button
              key={f.id}
              onClick={() => onPick(f)}
              disabled={!!busyId}
              className="w-full flex items-center gap-3 border border-[#EBEBEB] rounded-2xl p-3.5 hover:border-[#111] active:scale-[0.99] transition-all text-left disabled:opacity-60"
            >
              <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <HugeiconsIcon icon={EyeIcon} size={20} color="#2563EB" />
              </span>
              <span className="flex-1 text-sm font-bold text-[#111] font-display truncate">{f.name}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#111] text-white px-2.5 py-1.5 rounded-lg font-label shrink-0">
                {busyId === f.id ? '…' : (<><HugeiconsIcon icon={Coins01Icon} size={12} color="#F5C518" />2</>)}
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} className="w-full mt-3 text-xs text-[#AAA] font-label py-2">Cancel</button>
    </Sheet>
  )
}

export function PeekResult({ friendName, optionText, onDone }) {
  return (
    <Sheet onClose={onDone}>
      <p className="text-[10px] font-bold text-[#888] uppercase tracking-widest font-label text-center">{friendName} picked:</p>
      <div className="mt-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-sm text-[#111] font-body leading-relaxed">“{optionText}”</p>
      </div>
      <p className="text-[11px] text-[#AAA] font-label text-center mt-2">Find that wording among your options.</p>
      <button onClick={onDone}
        className="w-full mt-4 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.99] transition-all">
        Got it — pick my answer
      </button>
    </Sheet>
  )
}
