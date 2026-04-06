import { useState, useEffect } from 'react'
import { listenScores } from '../store/useStore'

export default function Results({ student, lastScore, setView }) {
  const [scores, setScores] = useState([])
  const [filter, setFilter] = useState('all')
  const [expandedScore, setExpandedScore] = useState(lastScore ? 'latest' : null)
  const [showCorrections, setShowCorrections] = useState(false)

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
    if (pct >= 70) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-50 border-green-200', bar: 'bg-green-500' }
    if (pct >= 50) return { label: 'Pass', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', bar: 'bg-yellow-500' }
    return { label: 'Fail', color: 'text-red-500', bg: 'bg-red-50 border-red-200', bar: 'bg-red-500' }
  }

  const getTotalScore = () => {
    if (!scores.length) return null
    const bySubject = {}
    scores.forEach((s) => { if (!bySubject[s.subject]) bySubject[s.subject] = s })
    const subjects = Object.values(bySubject)
    if (subjects.length < 4) return null
    const total = subjects.slice(0, 4).reduce((a, s) => a + s.score, 0)
    const totalOut = subjects.slice(0, 4).reduce((a, s) => a + (s.outOf || 160), 0)
    return { total, totalOut }
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
              isCorrect ? 'bg-green-50 border-green-200' :
              isSkipped ? 'bg-gray-50 border-gray-200' :
              'bg-red-50 border-red-200'
            }`}>
              <p className="text-sm font-medium text-gray-900 mb-2">
                {i + 1}. {q.question}
              </p>
              <div className="space-y-1 mb-2">
                {q.options.map((opt, oi) => (
                  <p key={oi} className={`text-xs px-2 py-1 rounded-lg ${
                    oi === q.answer
                      ? 'bg-green-200 text-green-800 font-semibold'
                      : oi === studentAns && !isCorrect
                      ? 'bg-red-200 text-red-800'
                      : 'text-gray-500'
                  }`}>
                    {String.fromCharCode(65 + oi)}. {opt}
                    {oi === q.answer && ' ✓'}
                    {oi === studentAns && !isCorrect && ' ✗'}
                  </p>
                ))}
              </div>
              {isSkipped && (
                <p className="text-xs text-gray-400">You skipped this question</p>
              )}
              {q.explanation && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-2 mt-2">
                  <p className="text-xs text-blue-700 font-medium mb-0.5">Explanation</p>
                  <p className="text-xs text-blue-600">{q.explanation}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex items-center gap-3 py-6">
          <button
            onClick={() => setView('dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Back
          </button>
          <h2 className="text-xl font-bold text-gray-900">My Results</h2>
        </div>

        {totalScore && (
          <div className="bg-gray-900 text-white rounded-2xl p-5 mb-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">JAMB Total Score</p>
            <p className="text-5xl font-bold">{totalScore.total}</p>
            <p className="text-gray-400 text-sm mt-1">out of 400</p>
            <div className="w-full bg-white/10 rounded-full h-2 mt-3">
              <div
                className="h-2 rounded-full bg-white transition-all"
                style={{ width: `${Math.min((totalScore.total / 400) * 100, 100)}%` }}
              />
            </div>
            <p className={`text-sm font-bold mt-2 ${
              totalScore.total >= 250 ? 'text-green-400' :
              totalScore.total >= 180 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {totalScore.total >= 250 ? 'Strong Performance' :
               totalScore.total >= 180 ? 'Average' : 'Needs Improvement'}
            </p>
          </div>
        )}

        {scores.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">Summary</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{scores.length}</p>
                <p className="text-xs text-gray-400">Attempts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)}
                </p>
                <p className="text-xs text-gray-400">Avg Marks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {Math.max(...scores.map((s) => s.score))}
                </p>
                <p className="text-xs text-gray-400">Best Score</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            All
          </button>
          {student.subjects.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <p className="text-gray-400 text-sm">No results yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s, i) => {
              const grade = getGrade(s.score, s.outOf)
              const outOf = s.outOf || 160
              const pct = Math.round((s.score / outOf) * 100)
              const isExpanded = expandedScore === s.id || (i === 0 && expandedScore === 'latest')
              return (
                <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedScore(isExpanded ? null : (s.id || i))}
                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{s.subject}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {s.week} · {new Date(s.date).toLocaleDateString('en-NG')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${grade.color}`}>{s.score}</p>
                        <p className="text-xs text-gray-400">/ {outOf}</p>
                      </div>
                    </div>
                    <div className="flex gap-3 mb-2">
                      <span className="text-xs text-green-600">{s.correct} correct (+{s.correct * 4})</span>
                      <span className="text-xs text-red-500">{s.wrong || 0} wrong (-{s.wrong || 0})</span>
                      <span className="text-xs text-gray-400">{s.unanswered || 0} skipped</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${grade.bar}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className={`text-xs font-medium ${grade.color}`}>{grade.label}</p>
                      <p className="text-xs text-gray-400">
                        {s.questions ? (isExpanded ? '▲ Hide corrections' : '▼ View corrections') : ''}
                      </p>
                    </div>
                  </button>

                  {isExpanded && s.questions && (
                    <div className="px-4 pb-4 border-t border-gray-100">
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
          className="w-full mt-6 border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Back to Dashboard
        </button>

      </div>
    </div>
  )
}