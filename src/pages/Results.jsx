import { useState, useEffect } from 'react'
import { listenScores } from '../store/useStore'

export default function Results({ student, lastScore, setView }) {
  const [scores, setScores] = useState([])
  const [filter, setFilter] = useState('all')
  const [expandedScore, setExpandedScore] = useState(lastScore ? 'latest' : null)

  useEffect(() => {
    const unsubscribe = listenScores((allScores) => {
      const mine = allScores
        .filter((s) => s.studentId === student.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
    })
    return () => unsubscribe()
  }, [student])

  const filtered = filter === 'all' ? scores : scores.filter((s) => s.subject === filter)

  const getGrade = (score, outOf) => {
    const pct = outOf ? (score / outOf) * 100 : 0
    if (pct >= 70) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-50 border-green-100', bar: 'bg-green-500' }
    if (pct >= 50) return { label: 'Pass', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100', bar: 'bg-yellow-500' }
    return { label: 'Fail', color: 'text-red-500', bg: 'bg-red-50 border-red-100', bar: 'bg-red-500' }
  }

  const getTotalScore = () => {
    if (!scores.length) return null
    const bySubject = {}
    scores.forEach((s) => { if (!bySubject[s.subject]) bySubject[s.subject] = s })
    const subjects = Object.values(bySubject)
    if (subjects.length < 4) return null
    const top4 = subjects.slice(0, 4)
    return {
      total: top4.reduce((a, s) => a + s.score, 0),
      totalOut: top4.reduce((a, s) => a + (s.outOf || 100), 0),
    }
  }

  const totalScore = getTotalScore()

  const renderCorrections = (s) => {
    if (!s.questions) return null
    return (
      <div className="mt-3 space-y-3">
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
              {isSkipped && <p className="text-[11px] text-[#AAA] font-label">You skipped this</p>}
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

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="max-w-md mx-auto px-4 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3 pt-8 pb-5">
          <button
            onClick={() => setView('dashboard')}
            className="text-[#888] hover:text-[#111] text-sm font-label transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold text-[#111] font-display">My Results</h2>
        </div>

        {/* JAMB Total Score */}
        {totalScore && (
          <div className="bg-[#111] text-white rounded-2xl p-5 mb-4">
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">
              JAMB Total Score
            </p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-5xl font-bold font-display">{totalScore.total}</span>
              <span className="text-[#555] text-lg mb-1 font-label">/ {totalScore.totalOut}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-3 mb-1.5">
              <div
                className="h-1.5 rounded-full bg-white transition-all"
                style={{ width: `${Math.min((totalScore.total / totalScore.totalOut) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between">
              <p className="text-[11px] text-[#555] font-label">
                {Math.round((totalScore.total / totalScore.totalOut) * 100)}%
              </p>
              <p className={`text-[11px] font-bold font-label ${
                totalScore.total >= 250 ? 'text-green-400' :
                totalScore.total >= 180 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {totalScore.total >= 250 ? 'Strong Performance' :
                 totalScore.total >= 180 ? 'Average' : 'Needs Improvement'}
              </p>
            </div>
          </div>
        )}

        {/* Summary stats */}
        {scores.length > 0 && (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <p className="text-xs font-bold text-[#888] uppercase tracking-wide font-label mb-3">Overview</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-[#111] font-display">{scores.length}</p>
                <p className="text-[10px] text-[#AAA] font-label mt-0.5">Attempts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#111] font-display">
                  {Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)}
                </p>
                <p className="text-[10px] text-[#AAA] font-label mt-0.5">Avg Score</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#111] font-display">
                  {Math.max(...scores.map((s) => s.score))}
                </p>
                <p className="text-[10px] text-[#AAA] font-label mt-0.5">Best</p>
              </div>
            </div>
          </div>
        )}

        {/* Subject filter */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
              filter === 'all' ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555] hover:border-[#AAA]'
            }`}
          >
            All
          </button>
          {student.subjects.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors font-label ${
                filter === s ? 'bg-[#111] text-white' : 'bg-white border border-[#E5E5E5] text-[#555] hover:border-[#AAA]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Results list */}
        {filtered.length === 0 ? (
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
            <p className="text-[#CCC] text-sm font-label">No results yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((s, i) => {
              const grade = getGrade(s.score, s.outOf)
              const outOf = s.outOf || 100
              const pct = Math.round((s.score / outOf) * 100)
              const isExpanded = expandedScore === s.id || (i === 0 && expandedScore === 'latest')
              return (
                <div key={i} className="bg-white border border-[#EBEBEB] rounded-xl overflow-hidden">
                  {/* Score summary row */}
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-bold text-[#111] font-body">{s.subject}</p>
                        <p className="text-[10px] text-[#AAA] font-label mt-0.5">
                          {s.week} · {new Date(s.date).toLocaleDateString('en-NG')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold font-display ${grade.color}`}>{s.score}</p>
                        <p className="text-[10px] text-[#AAA] font-label">/ {outOf}</p>
                      </div>
                    </div>

                    <div className="flex gap-3 mb-2.5">
                      <span className="text-[11px] text-green-600 font-label font-semibold">{s.correct} correct</span>
                      <span className="text-[11px] text-red-500 font-label font-semibold">{s.wrong || 0} wrong</span>
                      <span className="text-[11px] text-[#AAA] font-label">{s.unanswered || 0} skipped</span>
                    </div>

                    <div className="w-full bg-[#F3F3F2] rounded-full h-1 mb-3">
                      <div className={`h-1 rounded-full ${grade.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className={`text-[11px] font-bold font-label ${grade.color}`}>{grade.label} · {pct}%</p>
                      {s.questions && (
                        <button
                          onClick={() => setExpandedScore(isExpanded ? null : (s.id || i))}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors font-label ${
                            isExpanded
                              ? 'bg-[#111] text-white border-[#111]'
                              : 'bg-white text-[#555] border-[#E5E5E5] hover:border-[#111] hover:text-[#111]'
                          }`}
                        >
                          {isExpanded ? '▲ Hide Corrections' : '▼ View Corrections'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && s.questions && (
                    <div className="px-4 pb-4 border-t border-[#F3F3F2]">
                      {renderCorrections(s)}
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
