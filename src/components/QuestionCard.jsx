export default function QuestionCard({ question, selectedAnswer, onSelectAnswer, disabled }) {
  return (
    <>
      <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mt-4 mb-4">
        <p className="text-[#111] font-semibold text-base leading-relaxed font-body">{question.question}</p>
        {question.image && <img src={question.image} alt="Question" className="mt-3 max-h-72 w-full object-contain rounded-xl border border-[#EBEBEB] bg-[#F8F8F7]" />}
      </div>
      <div className="space-y-2.5 mb-5">
        {question.options.map((option, i) => (
          <button key={i} onClick={() => onSelectAnswer(i)} disabled={disabled}
            className={`w-full p-4 rounded-xl border text-left text-sm transition-all active:scale-[0.99] ${disabled && selectedAnswer !== i ? 'opacity-60' : ''} ${selectedAnswer === i ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#333] border-[#E5E5E5] hover:border-[#999]'}`}>
            <div className="flex items-start">
              <span className={`inline-flex w-6 h-6 rounded-full border items-center justify-center text-[11px] font-bold mr-3 shrink-0 ${selectedAnswer === i ? 'border-white/40 text-white' : 'border-[#CCC] text-[#888]'}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="font-body flex-1">{option}</span>
            </div>
            {question.optionImages?.[i] && <img src={question.optionImages[i]} alt={`Option ${i + 1}`} className="mt-2.5 max-h-40 w-full object-contain rounded-lg" />}
          </button>
        ))}
      </div>
    </>
  )
}
