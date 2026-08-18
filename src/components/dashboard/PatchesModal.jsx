export default function PatchesModal({ topicCount = 0, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl">
        <h3 className="text-base font-bold font-display text-[#111] mb-1">Activate My Patches</h3>
        <p className="text-xs text-[#888] font-label mb-5">
          {topicCount > 0
            ? `You have ${topicCount} topic${topicCount === 1 ? '' : 's'} to patch. Activate Patches to review corrections and retake them until you pass.`
            : 'Activate Patches to focus on your weak topics. Any topic you score below 50% on will show up here for corrections and retakes.'}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 bg-[#F3F3F2] text-[#888] rounded-xl py-3 text-sm font-bold font-label hover:bg-[#E5E5E5] transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors bg-red-700 text-white hover:bg-red-800"
          >
            Activate →
          </button>
        </div>
      </div>
    </div>
  )
}
