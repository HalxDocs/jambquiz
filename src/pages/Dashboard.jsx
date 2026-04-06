import { useState, useEffect } from 'react'
import { load, listenActiveWeek, listenScores } from '../store/useStore'

function isQuizTime() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  return day === 5 && mins >= 17 * 60 && mins < 18 * 60 + 30
}

function getTimeUntilQuiz() {
  const now = new Date()
  const day = now.getDay()
  const daysUntilFriday = (5 - day + 7) % 7 || 7
  const friday = new Date(now)
  friday.setDate(now.getDate() + daysUntilFriday)
  friday.setHours(17, 0, 0, 0)
  const diff = friday - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return { days, hours, mins }
}

export default function Dashboard({ student, setView }) {
  const [quizTime, setQuizTime] = useState(isQuizTime())
  const [timeLeft, setTimeLeft] = useState(getTimeUntilQuiz())
  const [scores, setScores] = useState([])
  const [currentWeek, setCurrentWeek] = useState('Week 1')

  useEffect(() => {
    const t = setInterval(() => {
      setQuizTime(isQuizTime())
      setTimeLeft(getTimeUntilQuiz())
    }, 10000)

    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))

    const unsubScores = listenScores((allScores) => {
      const mine = allScores
        .filter((s) => s.studentId === student.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setScores(mine)
    })

    return () => {
      clearInterval(t)
      unsubWeek()
      unsubScores()
    }
  }, [student])

  const hasAttemptedThisWeek = scores.some(
    (s) => s.week === currentWeek &&
    new Date(s.date).toDateString() === new Date().toDateString()
  )

  const getTotalScore = () => {
    const bySubject = {}
    scores.forEach((s) => { if (!bySubject[s.subject]) bySubject[s.subject] = s })
    const subjects = Object.values(bySubject)
    if (subjects.length < 4) return null
    return subjects.slice(0, 4).reduce((a, s) => a + s.score, 0)
  }

  const totalScore = getTotalScore()

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex justify-between items-center py-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Welcome back</p>
            <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
            {student.year && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg mt-1 inline-block">{student.year}</span>
            )}
          </div>
          <button
            onClick={() => setView('home')}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-2"
          >
            Logout
          </button>
        </div>

        {totalScore !== null && (
          <div className="bg-gray-900 text-white rounded-2xl p-4 mb-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-400">JAMB Total Score</p>
              <p className="text-3xl font-bold">{totalScore}<span className="text-sm text-gray-400 ml-1">/400</span></p>
            </div>
            <button
              onClick={() => setView('results')}
              className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl transition-colors"
            >
              View Results →
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {student.subjects.map((sub) => (
            <div key={sub} className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500">Subject</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-gray-900">This Week</p>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{currentWeek}</span>
          </div>

          {quizTime ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-700 font-bold text-sm mb-1">🟢 Quiz is LIVE now!</p>
              <p className="text-green-600 text-xs mb-3">Login closes 6:00pm · 1hr 30mins once started</p>
              {hasAttemptedThisWeek ? (
                <p className="text-gray-500 text-xs">You already attempted this week's quiz</p>
              ) : (
                <button
                  onClick={() => setView('quiz')}
                  className="bg-green-600 text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  Start Quiz →
                </button>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-gray-600 text-sm font-medium mb-1">Next quiz in</p>
              <p className="text-2xl font-bold text-gray-900">
                {timeLeft.days}d {timeLeft.hours}h {timeLeft.mins}m
              </p>
              <p className="text-gray-400 text-xs mt-1">Every Friday 5:00pm – 6:00pm login window</p>
            </div>
          )}
        </div>

        {scores.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-900">Recent Results</p>
              <button
                onClick={() => setView('results')}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                View all
              </button>
            </div>
            <div className="space-y-2">
              {scores.slice(0, 3).map((s, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-gray-700">{s.subject}</p>
                    <p className="text-xs text-gray-400">{s.week} · {new Date(s.date).toLocaleDateString('en-NG')}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      s.score >= 70 ? 'text-green-600' : s.score >= 50 ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                      {s.score}
                    </p>
                    <p className="text-xs text-gray-400">/{s.outOf || 160}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setView('results')}
          className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          View All My Results
        </button>

      </div>
    </div>
  )
}