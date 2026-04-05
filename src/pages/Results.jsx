import { useState, useEffect } from 'react'
import { load } from '../store/useStore'

export default function Results({ student, lastScore, setView }) {
  const [scores, setScores] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const allScores = load('jamb_scores', [])
    const mine = allScores.filter((s) => s.studentId === student.id)
    setScores(mine.reverse())
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
    scores.forEach((s) => {
      if (!bySubject[s.subject]) bySubject[s.subject] = s
    })
    const subjects = Object.values(bySubject)
    if (subjects.length < 4) return null
    const total = subjects.slice(0, 4).reduce((a, s) => a + s.score, 0)
    const totalOut = subjects.slice(0, 4).reduce((a, s) => a + (s.outOf || 160), 0)
    return { total, totalOut }
  }

  const totalScore = getTotalScore()

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

        {lastScore && (
          <div className={`border rounded-2xl p-5 mb-5 ${getGrade(lastScore.score, lastScore.outOf).bg}`}>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Latest Result</p>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-lg font-bold text-gray-900">{lastScore.subject}</p>
                <p className="text-xs text-gray-500 mt-0.5">{lastScore.week} · {new Date(lastScore.date).toLocaleDateString('en-NG')}</p>
              </div>
              <div className="text-right">
                <p className={`text-4xl font-bold ${getGrade(lastScore.score, lastScore.outOf).color}`}>
                  {lastScore.score}
                </p>
                <p className="text-xs text-gray-500">out of {lastScore.outOf || 160}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-white/70 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-green-600">{lastScore.correct}</p>
                <p className="text-xs text-gray-500">Correct</p>
                <p className="text-xs text-green-600 font-medium">+{lastScore.correct * 4}</p>
              </div>
              <div className="bg-white/70 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-red-500">{lastScore.wrong}</p>
                <p className="text-xs text-gray-500">Wrong</p>
                <p className="text-xs text-red-500 font-medium">-{lastScore.wrong}</p>
              </div>
              <div className="bg-white/70 rounded-xl p-2 text-center">
                <p className="text-lg font-bold text-gray-500">{lastScore.unanswered}</p>
                <p className="text-xs text-gray-500">Skipped</p>
                <p className="text-xs text-gray-400 font-medium">+0</p>
              </div>
            </div>

            <div className="w-full bg-white/50 rounded-full h-2 mb-2">
              <div
                className={`h-2 rounded-full transition-all ${getGrade(lastScore.score, lastScore.outOf).bar}`}
                style={{ width: `${Math.min((lastScore.score / (lastScore.outOf || 160)) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <p className={`text-sm font-semibold ${getGrade(lastScore.score, lastScore.outOf).color}`}>
                {getGrade(lastScore.score, lastScore.outOf).label}
              </p>
              <p className="text-xs text-gray-400">
                {Math.round((lastScore.score / (lastScore.outOf || 160)) * 100)}%
              </p>
            </div>
          </div>
        )}

        {totalScore && (
          <div className="bg-gray-900 text-white rounded-2xl p-5 mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">JAMB Total Score</p>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-4xl font-bold">{totalScore.total}</p>
                <p className="text-xs text-gray-400 mt-1">out of {totalScore.totalOut}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-300">4 Subjects Combined</p>
                <p className={`text-lg font-bold mt-1 ${
                  totalScore.total >= 200 ? 'text-green-400' : totalScore.total >= 150 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {totalScore.total >= 200 ? 'Strong' : totalScore.total >= 150 ? 'Average' : 'Needs Work'}
                </p>
              </div>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 mt-3">
              <div
                className="h-2 rounded-full bg-white transition-all"
                style={{ width: `${Math.min((totalScore.total / totalScore.totalOut) * 100, 100)}%` }}
              />
            </div>
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
            <p className="text-gray-400 text-sm">No results yet for this subject</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s, i) => {
              const grade = getGrade(s.score, s.outOf)
              const outOf = s.outOf || 160
              const pct = Math.round((s.score / outOf) * 100)
              return (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
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
                    <p className="text-xs text-gray-400">{pct}%</p>
                  </div>
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
