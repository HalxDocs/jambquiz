import { useState, useEffect } from 'react'
import { load, save, addScore, getQuestions, getTopics, getQuestionLimit, listenActiveWeek, normalizeTopic, getAccessStatus } from '../store/useStore'

function getQuizStatus() {
  const now = new Date()
  const day = now.getDay()
  const h = now.getHours()
  const m = now.getMinutes()
  const mins = h * 60 + m
  const isQuizDay = day === 5 || day === 6
  const isLoginWindow = isQuizDay && mins >= 17 * 60 && mins < 18 * 60
  const isQuizOpen = isQuizDay && mins >= 17 * 60 && mins < 19 * 60
  return { isQuizDay, isLoginWindow, isQuizOpen }
}

function getNextWeek(currentWeek) {
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
  const idx = weeks.indexOf(currentWeek)
  return weeks[Math.min(idx + 1, 3)]
}

function shuffleAndPick(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

export default function Quiz({ student, setView, setLastScore }) {
  const [step, setStep] = useState('subject')
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(60 * 60)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [attemptedSubjects, setAttemptedSubjects] = useState([])
  const [nextWeekTopics, setNextWeekTopics] = useState({})
  const [showCorrections, setShowCorrections] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [currentWeek, setCurrentWeek] = useState('Week 1')

  const nextWeek = getNextWeek(currentWeek)
  const { isQuizDay, isLoginWindow, isQuizOpen } = getQuizStatus()

  // Remaining subjects not yet attempted today
  const remainingSubjects = student.subjects.filter((s) => !attemptedSubjects.includes(s))

  useEffect(() => {
    const unsubWeek = listenActiveWeek((week) => {
      setCurrentWeek(week)
      const cached = load('jamb_scores_cache', [])
      const attempted = cached
        .filter(
          (s) =>
            s.studentId === student.id &&
            s.week === week &&
            new Date(s.date).toDateString() === new Date().toDateString()
        )
        .map((s) => s.subject)
      setAttemptedSubjects(attempted)
    })
    return () => unsubWeek()
  }, [])

  useEffect(() => {
    const next = getNextWeek(currentWeek)
    getTopics(next).then((t) => setNextWeekTopics(t || {}))
  }, [currentWeek])

  useEffect(() => {
    if (step !== 'quiz') return
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(t); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [step])

  useEffect(() => {
    if (timeLeft === 0 && step === 'quiz') handleSubmit()
  }, [timeLeft])

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startSubject = async (subject) => {
    if (!isLoginWindow) return
    setLoading(true)
    setErr('')
    try {
      const allQ = await getQuestions(subject, currentWeek)
      if (allQ.length === 0) {
        setErr(`No questions available for ${subject} – ${currentWeek} yet.`)
        setLoading(false)
        return
      }
      const limit = await getQuestionLimit(subject, currentWeek)
      const weekQ = shuffleAndPick(allQ, limit)
      setSelectedSubject(subject)
      setQuestions(weekQ)
      setAnswers(new Array(weekQ.length).fill(null))
      setTimeLeft(60 * 60)
      setStep('quiz')
    } catch {
      setErr('Failed to load questions. Check your connection.')
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

    let correct = 0, wrong = 0, unanswered = 0
    questions.forEach((q, i) => {
      if (answers[i] === null) unanswered++
      else if (answers[i] === q.answer) correct++
      else wrong++
    })

    const rawMarks = correct * 4 - wrong * 1
    const maxRaw = questions.length * 4
    const marks = Math.round((Math.max(0, rawMarks) / maxRaw) * 100)

    const result = {
      studentId: student.id,
      studentName: student.name,
      subject: selectedSubject,
      week: currentWeek,
      score: marks,
      outOf: 100,
      correct,
      wrong,
      unanswered,
      total: questions.length,
      answers,
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation || '',
        image: q.image || '',
        optionImages: q.optionImages || ['', '', '', ''],
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

  // ── DONE STATE ──────────────────────────────────────────────────────────────
  if (step === 'done' && lastResult) {
    const pct = lastResult.outOf ? Math.round((lastResult.score / lastResult.outOf) * 100) : 0
    const nextSubject = student.subjects.find((s) => !attemptedSubjects.includes(s))
    const allDone = remainingSubjects.length === 0 || !nextSubject

    return (
      <div className="min-h-screen bg-[#F8F8F7] p-4">
        <div className="max-w-md mx-auto">

          {/* Score hero */}
          <div className="bg-[#111] text-white rounded-2xl p-6 mt-8 mb-4">
            <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label mb-1">
              {lastResult.subject} · {lastResult.week}
            </p>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-5xl font-bold font-display">{lastResult.score}</span>
              <span className="text-[#555] text-lg mb-1 font-label">/ {lastResult.outOf}</span>
            </div>
            <p className={`text-sm font-bold mb-4 font-display ${
              pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {pct >= 70 ? 'Excellent' : pct >= 50 ? 'Good' : 'Keep practising'} · {pct}%
            </p>
            <div className="w-full bg-white/10 rounded-full h-1 mb-4">
              <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-green-400 font-display">{lastResult.correct}</p>
                <p className="text-[10px] text-[#666] font-label">Correct</p>
                <p className="text-[10px] text-green-500 font-label">+{lastResult.correct * 4}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-red-400 font-display">{lastResult.wrong}</p>
                <p className="text-[10px] text-[#666] font-label">Wrong</p>
                <p className="text-[10px] text-red-400 font-label">-{lastResult.wrong}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-[#555] font-display">{lastResult.unanswered}</p>
                <p className="text-[10px] text-[#666] font-label">Skipped</p>
                <p className="text-[10px] text-[#666] font-label">0</p>
              </div>
            </div>
          </div>

          {/* Next subject CTA */}
          {!allDone ? (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-3">
              <p className="text-[11px] font-semibold text-[#888] uppercase tracking-wide font-label mb-1">
                {remainingSubjects.length} subject{remainingSubjects.length !== 1 ? 's' : ''} remaining
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {remainingSubjects.map((s) => (
                  <span key={s} className="text-[11px] font-semibold text-[#555] border border-[#E5E5E5] px-2.5 py-1 rounded-full font-label">
                    {s}
                  </span>
                ))}
              </div>
              <button
                onClick={() => { setStep('subject'); setShowCorrections(false) }}
                className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display"
              >
                Next: {nextSubject} →
              </button>
            </div>
          ) : (
            <div className="bg-[#111] rounded-2xl p-4 mb-3 text-center">
              <p className="text-white font-bold font-display text-base mb-0.5">All subjects done!</p>
              <p className="text-[#666] text-xs font-label">Great work this week</p>
            </div>
          )}

          {/* Secondary actions */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowCorrections(!showCorrections)}
              className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] transition-colors font-label"
            >
              {showCorrections ? 'Hide' : 'View'} Corrections
            </button>
            <button
              onClick={() => setView('results')}
              className="flex-1 bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] transition-colors font-label"
            >
              All Results
            </button>
          </div>

          {/* Corrections */}
          {showCorrections && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-3">
              <p className="text-sm font-bold text-[#111] font-display mb-4">Corrections</p>
              <div className="space-y-3">
                {lastResult.questions.map((q, i) => {
                  const studentAns = lastResult.answers[i]
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
                      {q.image && <img src={q.image} alt="Question" className="mb-2 max-h-48 w-full object-contain rounded-lg border border-[#EBEBEB] bg-white" />}
                      <div className="space-y-1 mb-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className={`text-xs px-2.5 py-1.5 rounded-lg font-label ${
                            oi === q.answer
                              ? 'bg-green-200 text-green-800 font-semibold'
                              : oi === studentAns && !isCorrect
                              ? 'bg-red-200 text-red-800'
                              : 'text-[#888]'
                          }`}>
                            <p>
                              {String.fromCharCode(65 + oi)}. {opt}
                              {oi === q.answer && ' ✓'}
                              {oi === studentAns && !isCorrect && ' ✗'}
                            </p>
                            {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt={`Option ${oi + 1}`} className="mt-1 max-h-24 rounded" />}
                          </div>
                        ))}
                      </div>
                      {isSkipped && <p className="text-[11px] text-[#AAA] font-label">You skipped this</p>}
                      {q.explanation && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 mt-2">
                          <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                          <p className="text-xs text-blue-600 font-label leading-relaxed whitespace-pre-line">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Next week topics */}
          {Object.keys(nextWeekTopics).some((k) => normalizeTopic(nextWeekTopics[k])?.name) && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-3">
              <p className="text-sm font-bold text-[#111] font-display mb-3">
                {nextWeek} — Topics to Revise
              </p>
              <div className="space-y-2">
                {Object.entries(nextWeekTopics).map(([subject, raw]) => {
                  const t = normalizeTopic(raw)
                  if (!t?.name) return null
                  return (
                    <div key={subject} className="flex justify-between items-center py-1 gap-2">
                      <p className="text-xs text-[#555] font-body shrink-0">{subject}</p>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs text-[#111] font-semibold bg-[#F3F3F2] px-2.5 py-1 rounded-lg font-label truncate">{t.name}</p>
                        {t.video && (
                          <a href={t.video} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 shrink-0" title="Watch on YouTube">
                            ▶
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    )
  }

  // ── SUBSCRIPTION EXPIRED ────────────────────────────────────────────────────
  if (getAccessStatus(student).status === 'expired') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-[#111] font-display mb-2">Access Expired</h2>
          <p className="text-sm text-[#888] font-label mb-6">
            Your subscription has ended. Renew for ₦800/month to continue.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setView('dashboard')}
              className="flex-1 border border-[#E5E5E5] text-[#555] px-4 py-3 rounded-xl text-sm font-bold hover:bg-[#F8F8F7] transition-colors font-display"
            >
              Back
            </button>
            <button
              onClick={() => setView('subscribe')}
              className="flex-1 bg-[#111] text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-[#222] transition-colors font-display"
            >
              Subscribe →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── LOCKED ──────────────────────────────────────────────────────────────────
  if (!isQuizDay || !isQuizOpen) {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-[#F3F3F2] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-[#111] font-display mb-2">Quiz Locked</h2>
          <p className="text-sm text-[#888] font-label mb-1">
            Login window: <strong className="text-[#111]">Fri & Sat · 5:00pm – 6:00pm</strong>
          </p>
          <p className="text-sm text-[#888] font-label mb-6">
            Once started: <strong className="text-[#111]">1 hour</strong> per subject
          </p>
          <button
            onClick={() => setView('dashboard')}
            className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#222] transition-colors font-display"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── LOGIN WINDOW CLOSED ─────────────────────────────────────────────────────
  if (!isLoginWindow && step === 'subject') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-[#F3F3F2] rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-xl">⏰</span>
          </div>
          <h2 className="text-xl font-bold text-[#111] font-display mb-2">Login Window Closed</h2>
          <p className="text-sm text-[#888] font-label mb-6">
            New quiz starts closed at 6:00pm. You can only start between 5:00pm and 6:00pm.
          </p>
          <button
            onClick={() => setView('dashboard')}
            className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#222] transition-colors font-display"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── SUBJECT SELECTION ───────────────────────────────────────────────────────
  if (step === 'subject') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] p-4">
        <div className="max-w-md mx-auto">

          <div className="flex items-center gap-3 pt-8 pb-2">
            <button
              onClick={() => setView('dashboard')}
              className="text-[#888] hover:text-[#111] text-sm font-label transition-colors"
            >
              ← Back
            </button>
          </div>

          <div className="pb-5">
            <h2 className="text-2xl font-bold text-[#111] font-display">Choose Subject</h2>
            <p className="text-sm text-[#888] font-label mt-1">{currentWeek} · JAMB scoring: +4 correct, −1 wrong</p>
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-2 bg-white border border-[#EBEBEB] rounded-xl px-4 py-3 mb-4">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-bold text-green-700 font-display">Quiz is Live</p>
            <span className="ml-auto text-xs text-[#AAA] font-label">Login closes 6:00pm</span>
          </div>

          {err && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 mb-4">
              <p className="text-red-600 text-sm font-label">{err}</p>
            </div>
          )}

          <div className="space-y-2.5">
            {student.subjects.map((subject) => {
              const attempted = attemptedSubjects.includes(subject)
              return (
                <button
                  key={subject}
                  onClick={() => !attempted && !loading && startSubject(subject)}
                  disabled={attempted || loading}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    attempted
                      ? 'bg-[#F3F3F2] border-[#EBEBEB] cursor-not-allowed'
                      : 'bg-white border-[#E5E5E5] hover:border-[#111] hover:shadow-sm active:scale-[0.99]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className={`text-sm font-bold font-body ${attempted ? 'text-[#AAA]' : 'text-[#111]'}`}>
                      {subject}
                    </p>
                    {attempted ? (
                      <span className="text-[11px] font-bold text-white bg-[#111] px-2.5 py-1 rounded-full font-label">
                        ✓ Done
                      </span>
                    ) : loading ? (
                      <span className="text-[11px] font-semibold text-[#AAA] bg-[#F3F3F2] px-2.5 py-1 rounded-full font-label">
                        Loading…
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full font-label">
                        Start →
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {attemptedSubjects.length > 0 && (
            <p className="text-center text-xs text-[#AAA] mt-4 font-label">
              {attemptedSubjects.length} of {student.subjects.length} subjects completed
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── ACTIVE QUIZ ─────────────────────────────────────────────────────────────
  const q = questions[current]
  const answeredCount = answers.filter((a) => a !== null).length
  const skippedCount = answers.filter((a) => a === null).length

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      {/* Sticky top bar */}
      <div className="bg-white border-b border-[#EBEBEB] px-4 py-3 sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide font-label">
                {selectedSubject} · {currentWeek}
              </p>
              <p className="text-sm font-bold text-[#111] font-display">
                Question {current + 1} <span className="text-[#AAA] font-normal">of {questions.length}</span>
              </p>
            </div>
            <div className={`text-sm font-bold px-3 py-1.5 rounded-xl font-display ${
              timeLeft < 300 ? 'bg-red-100 text-red-600' : 'bg-[#F3F3F2] text-[#111]'
            }`}>
              ⏱ {formatTime(timeLeft)}
            </div>
          </div>
          <div className="w-full bg-[#F3F3F2] rounded-full h-1">
            <div
              className="bg-[#111] h-1 rounded-full transition-all"
              style={{ width: `${((current + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pb-6">

        {/* Progress summary — no correct/wrong reveal during quiz */}
        <div className="grid grid-cols-2 gap-2 mt-4 mb-4">
          <div className="bg-white border border-[#EBEBEB] rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-[#111] font-display">{answeredCount}</p>
            <p className="text-[10px] text-[#888] font-label">Answered</p>
          </div>
          <div className="bg-[#F8F8F7] border border-[#EBEBEB] rounded-xl p-2.5 text-center">
            <p className="text-lg font-bold text-[#AAA] font-display">{skippedCount}</p>
            <p className="text-[10px] text-[#AAA] font-label">Not answered</p>
          </div>
        </div>

        {/* Question */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
          <p className="text-[#111] font-semibold text-base leading-relaxed font-body">{q.question}</p>
          {q.image && (
            <img src={q.image} alt="Question" className="mt-3 max-h-72 w-full object-contain rounded-xl border border-[#EBEBEB] bg-[#F8F8F7]" />
          )}
        </div>

        {/* Options */}
        <div className="space-y-2.5 mb-5">
          {q.options.map((option, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              className={`w-full p-4 rounded-xl border text-left text-sm transition-all active:scale-[0.99] ${
                answers[current] === i
                  ? 'bg-[#111] text-white border-[#111]'
                  : 'bg-white text-[#333] border-[#E5E5E5] hover:border-[#999]'
              }`}
            >
              <div className="flex items-start">
                <span className={`inline-flex w-6 h-6 rounded-full border items-center justify-center text-[11px] font-bold mr-3 shrink-0 ${
                  answers[current] === i
                    ? 'border-white/40 text-white'
                    : 'border-[#CCC] text-[#888]'
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-body flex-1">{option}</span>
              </div>
              {q.optionImages?.[i] && (
                <img src={q.optionImages[i]} alt={`Option ${i + 1}`} className="mt-2.5 max-h-40 w-full object-contain rounded-lg bg-white/5" />
              )}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex gap-2.5 mb-4">
          {current > 0 && (
            <button
              onClick={() => setCurrent(current - 1)}
              className="flex-1 bg-white border border-[#E5E5E5] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] transition-colors font-label"
            >
              ← Prev
            </button>
          )}
          {current < questions.length - 1 ? (
            <button
              onClick={() => setCurrent(current + 1)}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold hover:bg-[#222] transition-colors font-display"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex-1 rounded-xl py-3 text-sm font-bold transition-colors font-display ${
                submitting
                  ? 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {submitting ? 'Submitting…' : `Submit Quiz ✓ (${answeredCount}/${questions.length})`}
            </button>
          )}
        </div>

        {/* Question dots */}
        <div className="flex gap-1 flex-wrap">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              title={`Question ${i + 1}`}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors font-label ${
                i === current
                  ? 'bg-[#111] text-white'
                  : answers[i] !== null
                  ? 'bg-[#333] text-white'
                  : 'bg-white border border-[#E5E5E5] text-[#AAA]'
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
