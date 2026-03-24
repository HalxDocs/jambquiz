import { useState, useEffect } from 'react'
import { load, save } from '../store/useStore'

function isQuizTime() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  return day === 5 && mins >= 17 * 60 && mins < 18 * 60 + 30
}

function getCurrentWeek() {
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
  const w = Math.floor(((Date.now() / 86400000) % 28) / 7)
  return weeks[Math.min(w, 3)]
}

export default function Quiz({ student, setView, setLastScore }) {
  const [step, setStep] = useState('subject')
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(90 * 60)
  const [err, setErr] = useState('')

  const currentWeek = getCurrentWeek()

  useEffect(() => {
    if (step !== 'quiz') return
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t)
          submitQuiz()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [step])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startSubject = (subject) => {
    const allQ = load('jamb_questions', {})
    const weekQ = allQ[subject]?.[currentWeek] || []
    if (weekQ.length === 0) {
      setErr(`No questions available for ${subject} - ${currentWeek} yet. Please check back later.`)
      return
    }
    setSelectedSubject(subject)
    setQuestions(weekQ)
    setAnswers(new Array(weekQ.length).fill(null))
    setStep('quiz')
    setErr('')
  }

  const selectAnswer = (optionIndex) => {
    const updated = [...answers]
    updated[current] = optionIndex
    setAnswers(updated)
  }

  const submitQuiz = () => {
    let correct = 0
    questions.forEach((q, i) => {
      if (answers[i] === q.answer) correct++
    })
    const score = Math.round((correct / questions.length) * 100)
    const result = {
      studentId: student.id,
      studentName: student.name,
      subject: selectedSubject,
      week: currentWeek,
      score,
      correct,
      total: questions.length,
      answers,
      date: new Date().toISOString(),
    }
    const allScores = load('jamb_scores', [])
    save('jamb_scores', [...allScores, result])
    setLastScore(result)
    setView('results')
  }

  if (!isQuizTime()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quiz is Locked</h2>
          <p className="text-gray-500 text-sm mb-6">
            The quiz is only available every Friday between 5:00pm and 6:30pm
          </p>
          <button
            onClick={() => setView('dashboard')}
            className="bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-gray-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (step === 'subject') {
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
            <h2 className="text-xl font-bold text-gray-900">Choose Subject</h2>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-5 text-center">
            <p className="text-green-700 text-sm font-medium">🟢 Quiz is Live · {currentWeek}</p>
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-red-600 text-sm">{err}</p>
            </div>
          )}

          <div className="space-y-3">
            {student.subjects.map((subject) => {
              const allScores = load('jamb_scores', [])
              const attempted = allScores.some(
                (s) =>
                  s.studentId === student.id &&
                  s.subject === subject &&
                  s.week === currentWeek &&
                  new Date(s.date).toDateString() === new Date().toDateString()
              )
              return (
                <button
                  key={subject}
                  onClick={() => !attempted && startSubject(subject)}
                  disabled={attempted}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    attempted
                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                      : 'bg-white border-gray-200 hover:border-gray-900 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className={`text-sm font-semibold ${attempted ? 'text-gray-400' : 'text-gray-900'}`}>
                      {subject}
                    </p>
                    {attempted ? (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">Done</span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg">Start →</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const q = questions[current]

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">

        <div className="flex justify-between items-center py-4">
          <div>
            <p className="text-xs text-gray-400">{selectedSubject} · {currentWeek}</p>
            <p className="text-sm font-semibold text-gray-900">
              Question {current + 1} of {questions.length}
            </p>
          </div>
          <div className={`text-sm font-bold px-3 py-2 rounded-xl ${
            timeLeft < 300 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-700'
          }`}>
            ⏱ {formatTime(timeLeft)}
          </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
          <div
            className="bg-gray-900 h-1.5 rounded-full transition-all"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <p className="text-gray-900 font-medium text-base leading-relaxed">{q.question}</p>
        </div>

        <div className="space-y-3 mb-6">
          {q.options.map((option, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              className={`w-full p-4 rounded-xl border text-left text-sm font-medium transition-all ${
                answers[current] === i
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              <span className={`inline-block w-6 h-6 rounded-full border text-xs text-center leading-5 mr-3 ${
                answers[current] === i
                  ? 'border-white text-white'
                  : 'border-gray-300 text-gray-400'
              }`}>
                {String.fromCharCode(65 + i)}
              </span>
              {option}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          {current > 0 && (
            <button
              onClick={() => setCurrent(current - 1)}
              className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              ← Previous
            </button>
          )}
          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent(current + 1)}
              disabled={answers[current] === null}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${
                answers[current] !== null
                  ? 'bg-gray-900 text-white hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={submitQuiz}
              disabled={answers.includes(null)}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${
                !answers.includes(null)
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Submit Quiz ✓
            </button>
          )}
        </div>

        <div className="flex gap-1 mt-4 flex-wrap">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                i === current
                  ? 'bg-gray-900 text-white'
                  : answers[i] !== null
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}