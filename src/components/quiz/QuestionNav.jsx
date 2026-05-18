export default function QuestionNav({ total, currentIndex, answers, onJump }) {
  return (
    <div className="flex gap-1 flex-wrap mb-5">
      {Array.from({ length: total }, (_, i) => (
        <button key={i} onClick={() => onJump(i)}
          className={`w-8 h-8 rounded-lg text-xs font-bold font-label transition-colors ${
            i === currentIndex ? 'bg-[#111] text-white' :
            answers[i] !== null && answers[i] !== undefined ? 'bg-[#333] text-white' :
            'bg-white border border-[#E5E5E5] text-[#AAA]'
          }`}>
          {i + 1}
        </button>
      ))}
    </div>
  )
}
