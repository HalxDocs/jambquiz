import { useState, useEffect } from 'react'
import { listenScores, listenTopics } from '../store/useStore'

function renderCorrections(s) {
  if (!s.questions) return null
  return (
    <div className="mt-4 space-y-3">
      {s.questions.map((q, i) => {
        const studentAns = s.answers[i]
        const isCorrect = studentAns === q.answer
        const isSkipped = studentAns === null
        return (
          <div key={i} className={`rounded-xl p-3 border ${
            isCorrect ? 'bg-green-50 border-green-100' :
            isSkipped ? 'bg-[#F8F8F7] border-[#EBEBEB]' :
            'bg-red-50 border-red-100'
          }`}>
            <p className="text-xs font-semibold text-[#111] mb-2 font-body leading-snug">
              {i + 1}. {q.question}
            </p>
            <div className="space-y-1 mb-2">
              {q.options.map((opt, oi) => (
                <p key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg font-label ${
                  oi === q.answer
                    ? 'bg-green-200 text-green-800 font-semibold'
                    : oi === studentAns && !isCorrect
                    ? 'bg-red-200 text-red-800'
                    : 'text-[#888]'
                }`}>
                  {String.fromCharCode(65 + oi)}. {opt}
                  {oi === q.answer && ' ✓'}
                  {oi === studentAns && !isCorrect && ' ✗'}
                </p>
              ))}
            </div>
            {isSkipped && <p className="text-[11px] text-[#AAA] font-label">You skipped this question</p>}
            {q.explanation && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mt-2">
                <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                <p className="text-xs text-blue-600 font-label leading-relaxed">{q.explanation}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SubjectDetail({ student, subject, setView }) {
  const [scores, setScores] = useState([])
  const [allTopics, setAllTopics] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    const unsubScores = listenScores((allScores) => {
      const mine = allScores
        .filter((s) => s.studentId === student.id && s.subject === subject)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
    })
    const unsubTopics = listenTopics((topics) => setAllTopics(topics))
    return () => { unsubScores(); unsubTopics() }
  }, [student, subject])

  const getTopicName = (score) => {
    return allTopics[score.week]?.[subject] || null
  }

  const getPct = (score) => {
    const outOf = score.outOf || 160
    return outOf > 0 ? Math.round((score.score / outOf) * 100) : 0
  }

  const getGradeColor = (pct) => {
    if (pct >= 70) return { text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', bar: 'bg-green-500' }
    if (pct >= 50) return { text: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100', bar: 'bg-yellow-500' }
    return { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100', bar: 'bg-red-400' }
  }

  const bestScore = scores.length
    ? Math.max(...scores.map((s) => getPct(s)))
    : null

  const avgScore = scores.length
    ? Math.round(scores.reduce((a, s) => a + getPct(s), 0) / scores.length)
    : null

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        {/* Header */}
        <div className="pt-8 pb-5">
          <button
            onClick={() => setView('dashboard')}
            className="text-[#888] hover:text-[#111] text-sm font-label transition-colors mb-4 block"
          >
            ← Back to Dashboard
          </button>
          <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-1">
            Topic Performance
          </p>
          <h2 className="text-2xl font-bold text-[#111] font-display">{subject}</h2>
        </div>

        {/* Summary bar */}
        {scores.length > 0 && (
          <div className="bg-[#111] text-white rounded-2xl p-4 mb-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xl font-bold font-display">{scores.length}</p>
                <p className="text-[10px] text-[#666] font-label mt-0.5">Tests taken</p>
              </div>
              <div className="text-center border-x border-white/10">
                <p className="text-xl font-bold font-display">{avgScore}%</p>
                <p className="text-[10px] text-[#666] font-label mt-0.5">Average</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold font-display ${
                  bestScore >= 70 ? 'text-green-400' : bestScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>{bestScore}%</p>
                <p className="text-[10px] text-[#666] font-label mt-0.5">Best</p>
              </div>
            </div>
          </div>
        )}

        {/* Topic list */}
        {scores.length === 0 ? (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
            <p className="text-[#CCC] text-sm font-label">No tests taken for {subject} yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {scores.map((score) => {
              const pct = getPct(score)
              const grade = getGradeColor(pct)
              const topicName = getTopicName(score)
              const isExpanded = expandedId === score.id
              const outOf = score.outOf || 160

              return (
                <div key={score.id} className="bg-white border border-[#EBEBEB] rounded-xl overflow-hidden">
                  {/* Topic row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        {topicName ? (
                          <p className="text-sm font-bold text-[#111] font-body leading-snug">{topicName}</p>
                        ) : (
                          <p className="text-sm font-bold text-[#999] font-body italic">Topic not set</p>
                        )}
                        <p className="text-[11px] text-[#AAA] font-label mt-0.5">
                          {score.week} · {new Date(score.date).toLocaleDateString('en-NG')}
                        </p>
                      </div>

                      {/* Percentage badge */}
                      <div className={`shrink-0 px-3 py-1.5 rounded-xl border font-bold text-sm font-display ${grade.bg} ${grade.border} ${grade.text}`}>
                        {pct}%
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className="flex gap-3 mb-2.5 text-[11px] font-label">
                      <span className="text-[#555]">{score.score}/{outOf} marks</span>
                      <span className="text-green-600">{score.correct} correct</span>
                      <span className="text-red-500">{score.wrong || 0} wrong</span>
                      <span className="text-[#AAA]">{score.unanswered || 0} skipped</span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-[#F3F3F2] rounded-full h-1.5 mb-3">
                      <div
                        className={`h-1.5 rounded-full ${grade.bar} transition-all`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    {/* Corrections toggle */}
                    {score.questions && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : score.id)}
                        className={`w-full text-xs font-bold py-2 rounded-lg border transition-colors font-label ${
                          isExpanded
                            ? 'bg-[#111] text-white border-[#111]'
                            : 'bg-white text-[#555] border-[#E5E5E5] hover:border-[#111] hover:text-[#111]'
                        }`}
                      >
                        {isExpanded ? '▲ Hide Corrections' : '▼ View Corrections & Answers'}
                      </button>
                    )}
                  </div>

                  {/* Corrections */}
                  {isExpanded && score.questions && (
                    <div className="px-4 pb-4 border-t border-[#F3F3F2]">
                      <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mt-4 mb-3">
                        {topicName || score.week} — Full Corrections
                      </p>
                      {renderCorrections(score)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={() => setView('dashboard')}
          className="w-full mt-5 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm text-[#888] hover:text-[#111] hover:border-[#CCC] transition-colors font-label"
        >
          Back to Dashboard
        </button>

      </div>
    </div>
  )
}
