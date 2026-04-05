import { useState, useEffect } from 'react'
import { load, save, addScore, getQuestions, getTopics } from '../store/useStore'

function getQuizStatus() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  const isFriday = day === 5
  const isLoginWindow = mins >= 17 * 60 && mins < 18 * 60
  const isQuizOpen = mins >= 17 * 60 && mins < 19 * 60 + 30
  return { isFriday, isLoginWindow, isQuizOpen }
}

function getCurrentWeek() {
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
  const w = Math.floor(((Date.now() / 86400000) % 28) / 7)
  return weeks[Math.min(w, 3)]
}

function getNextWeek() {
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
  const w = Math.floor(((Date.now() / 86400000) % 28) / 7)
  return weeks[Math.min(w + 1, 3)]
}

export default function Quiz({ student, setView, setLastScore }) {
  const [step, setStep] = useState('subject')
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(90 * 60)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [attemptedSubjects, setAttemptedSubjects] = useState([])
  const [nextWeekTopics, setNextWeekTopics] = useState({})
  const [showCorrections, setShowCorrections] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const currentWeek = getCurrentWeek()
  const nextWeek = getNextWeek()
  const { isFriday, isLoginWindow, isQuizOpen } = getQuizStatus()

  useEffect(() => {
    const cached = load('jamb_scores_cache', [])
    const attempted = cached
      .filter(
        (s) =>
          s.studentId === student.id &&
          s.week === currentWeek &&
          new Date(s.date).toDateString() === new Date().toDateString()
      )
      .map((s) => s.subject)
    setAttemptedSubjects(attempted)

    getTopics(nextWeek).then((t) => setNextWeekTopics(t || {}))
  }, [])

  useEffect(() => {
    if (step !== 'quiz') return
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [step])

  useEffect(() => {
    if (timeLeft === 0 && step === 'quiz') {
      handleSubmit()
    }
  }, [timeLeft])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startSubject = async (subject) => {
    if (!isLoginWindow && !isQuizOpen) return
    setLoading(true)
    setErr('')
    try {
      const weekQ = await getQuestions(subject, currentWeek)
      if (weekQ.length === 0) {
        setErr(`No questions available for ${subject} - ${currentWeek} yet.`)
        setLoading(false)
        return
      }
      setSelectedSubject(subject)
      setQuestions(weekQ)
      setAnswers(new Array(weekQ.length).fill(null))
      setStep('quiz')
    } catch (e) {
      setErr('Failed to load questions. Check your connection and try again.')
    }
    setLoading(false)
  }

  const selectAnswer = (optionIndex) => {
    const updated = [...answers]
    updated[current] = optionIndex
    setAnswers(updated)
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)

    let correct = 0
    let wrong = 0
    let unanswered = 0

    questions.forEach((q, i) => {
      if (answers[i] === null) {
        unanswered++
      } else if (answers[i] === q.answer) {
        correct++
      } else {
        wrong++
      }
    })

    const rawMarks = correct * 4 - wrong * 1
    const marks = Math.max(0, rawMarks)
    const outOf = questions.length * 4

    const result = {
      studentId: student.id,
      studentName: student.name,
      subject: selectedSubject,
      week: currentWeek,
      score: marks,
      outOf,
      correct,
      wrong,
      unanswered,
      total: questions.length,
      answers,
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options,
        answer: q.answer,
      })),
      date: new Date().toISOString(),
    }

    try {
      await addScore(result)
      const cached = load('jamb_scores_cache', [])
      save('jamb_scores_cache', [...cached, result])
      setAttemptedSubjects((prev) => [...prev, selectedSubject])
    } catch (e) {
      console.error('Failed to save score:', e)
    }

    setLastResult(result)
    setLastScore(result)
    setStep('done')
    setSubmitting(false)
  }

  if (step === 'done' && lastResult) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto">
          <div className="py-6 text-center">
            <p className="text-4xl mb-2">✅</p>
            <h2 className="text-xl font-bold text-gray-900">Quiz Submitted!</h2>
            <p className="text-gray-500 text-sm mt-1">{lastResult.subject} · {lastResult.week}</p>
          </div>

          <div className="bg-gray-900 text-white rounded-2xl p-5 mb-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Your Score</p>
            <p className="text-5xl font-bold">{lastResult.score}</p>
            <p className="text-gray-400 text-sm mt-1">out of {lastResult.outOf}</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <p className="text-lg font-bold text-green-400">{lastResult.correct}</p>
                <p className="text-xs text-gray-400">Correct (+{lastResult.correct * 4})</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-400">{lastResult.wrong}</p>
                <p className="text-xs text-gray-400">Wrong (-{lastResult.wrong})</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-400">{lastResult.unanswered}</p>
                <p className="text-xs text-gray-400">Skipped</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowCorrections(!showCorrections)}
            className="w-full bg-blue-50 border border-blue-200 rounded-xl py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors mb-4"
          >
            {showCorrections ? 'Hide Corrections' : '📖 View Corrections'}
          </button>

          {showCorrections && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-bold text-gray-900 mb-4">Corrections</p>
              <div className="space-y-4">
                {lastResult.questions.map((q, i) => {
                  const studentAns = lastResult.answers[i]
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
                      <div className="space-y-1">
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
                        <p className="text-xs text-gray-400 mt-1">You skipped this question</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {Object.keys(nextWeekTopics).length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-bold text-blue-900 mb-3">📚 {nextWeek} Topics to Revise</p>
              <div className="space-y-2">
                {Object.entries(nextWeekTopics).map(([subject, topic]) => (
                  <div key={subject} className="flex justify-between items-center">
                    <p className="text-xs text-blue-700 font-medium">{subject}</p>
                    <p className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-lg">{topic}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('subject')}
              className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Another Subject
            </button>
            <button
              onClick={() => setView('results')}
              className="flex-1 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700"
            >
              View All Results
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isFriday || !isQuizOpen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quiz is Locked</h2>
          <p className="text-gray-500 text-sm mb-2">
            Login window: <strong>Friday 5:00pm – 6:00pm</strong>
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Once started, you have <strong>1 hour 30 minutes</strong>
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

  if (!isLoginWindow && step === 'subject') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center">
          <p className="text-4xl mb-4">⏰</p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Login Window Closed</h2>
          <p className="text-gray-500 text-sm mb-6">
            New logins closed at 6:00pm. You can only start the quiz between 5:00pm and 6:00pm.
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

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-blue-700 text-xs font-medium">📝 JAMB Scoring: +4 correct · -1 wrong · 0 unanswered</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-5 text-center">
            <p className="text-green-700 text-sm font-medium">🟢 Quiz is Live · {currentWeek}</p>
            <p className="text-green-600 text-xs mt-1">Login closes 6:00pm · 1hr 30mins per subject</p>
          </div>

          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-red-600 text-sm">{err}</p>
            </div>
          )}

          <div className="space-y-3">
            {student.subjects.map((subject) => {
              const attempted = attemptedSubjects.includes(subject)
              return (
                <button
                  key={subject}
                  onClick={() => !attempted && !loading && startSubject(subject)}
                  disabled={attempted || loading}
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
                    ) : loading ? (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">Loading...</span>
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

        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
          <div
            className="bg-gray-900 h-1.5 rounded-full transition-all"
            style={{ width: `${((current + 1) / questions.length) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-2 text-center">
            <p className="text-xs text-green-600 font-medium">Correct</p>
            <p className="text-lg font-bold text-green-700">
              {answers.filter((a, i) => a !== null && a === questions[i]?.answer).length}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-center">
            <p className="text-xs text-red-500 font-medium">Wrong</p>
            <p className="text-lg font-bold text-red-600">
              {answers.filter((a, i) => a !== null && a !== questions[i]?.answer).length}
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-center">
            <p className="text-xs text-gray-500 font-medium">Skipped</p>
            <p className="text-lg font-bold text-gray-600">
              {answers.filter((a) => a === null).length}
            </p>
          </div>
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
              className="flex-1 rounded-xl py-3 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors ${
                submitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Quiz ✓'}
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
                  ? answers[i] === questions[i]?.answer
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-500'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="mt-3 text-center">
          <p className="text-xs text-gray-400">+4 correct · -1 wrong · 0 skipped</p>
        </div>

      </div>
    </div>
  )
}