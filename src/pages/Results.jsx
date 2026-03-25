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

  const getGrade = (score) => {
    if (score >= 70) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-50 border-green-200' }
    if (score >= 50) return { label: 'Pass', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' }
    return { label: 'Fail', color: 'text-red-500', bg: 'bg-red-50 border-red-200' }
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

        {lastScore && (
          <div className={`border rounded-2xl p-5 mb-5 ${getGrade(lastScore.score).bg}`}>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Latest Score</p>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-lg font-bold text-gray-900">{lastScore.subject}</p>
                <p className="text-xs text-gray-500">{lastScore.week} · {new Date(lastScore.date).toLocaleDateString('en-NG')}</p>
              </div>
              <div className="text-right">
                <p className={`text-4xl font-bold ${getGrade(lastScore.score).color}`}>
                  {lastScore.score}%
                </p>
                <p className="text-xs text-gray-500">{lastScore.correct}/{lastScore.total} correct</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-white rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    lastScore.score >= 70 ? 'bg-green-500' : lastScore.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${lastScore.score}%` }}
                />
              </div>
            </div>
            <p className={`text-sm font-semibold mt-2 ${getGrade(lastScore.score).color}`}>
              {getGrade(lastScore.score).label}
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
                  {Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)}%
                </p>
                <p className="text-xs text-gray-400">Average</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {Math.max(...scores.map((s) => s.score))}%
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
              const grade = getGrade(s.score)
              return (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.subject}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.week} · {new Date(s.date).toLocaleDateString('en-NG')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${grade.color}`}>{s.score}%</p>
                      <p className="text-xs text-gray-400">{s.correct}/{s.total}</p>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        s.score >= 70 ? 'bg-green-500' : s.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${s.score}%` }}
                    />
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