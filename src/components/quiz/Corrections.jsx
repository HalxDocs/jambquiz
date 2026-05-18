export default function Corrections({ questions, answers }) {
  return (
    <div className="mb-3 space-y-2">
      {questions.map((q, i) => {
        const sa = answers[i]
        const isOk = sa === q.answer
        const isSkip = sa === null || sa === undefined
        return (
          <div key={i} className={`rounded-xl p-3 border text-xs ${isOk ? 'bg-green-50 border-green-100' : isSkip ? 'bg-[#F8F8F7] border-[#EBEBEB]' : 'bg-red-50 border-red-100'}`}>
            <p className="font-semibold text-[#111] mb-1.5 font-body leading-snug">{i + 1}. {q.question}</p>
            {q.image && <img src={q.image} alt="Q" className="mb-2 max-h-40 w-full object-contain rounded-lg border border-[#EBEBEB] bg-white" />}
            <div className="space-y-0.5 mb-1.5">
              {q.options.map((opt, oi) => (
                <div key={oi} className={`px-2.5 py-1.5 rounded-lg font-label ${oi === q.answer ? 'bg-green-200 text-green-800 font-semibold' : oi === sa && !isOk ? 'bg-red-200 text-red-800' : 'text-[#888]'}`}>
                  {String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}{oi === sa && !isOk && ' ✗'}
                  {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt="" className="mt-1 max-h-20 rounded" />}
                </div>
              ))}
            </div>
            {isSkip && <p className="text-[#AAA] font-label">Skipped</p>}
            {q.explanation && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mt-1.5">
                <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                <p className="text-blue-600 font-label leading-relaxed whitespace-pre-line">{q.explanation}</p>
                {q.explanationImage && <img src={q.explanationImage} alt="" className="mt-1.5 max-h-40 w-full object-contain rounded-lg border border-blue-100" />}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
