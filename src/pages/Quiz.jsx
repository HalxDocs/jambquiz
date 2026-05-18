import { useState, useEffect, useRef } from 'react'
import { load, save, addScore, getQuestions, getTopics, getQuestionLimit, listenActiveWeek, normalizeTopic, getAccessStatus, listenQuizDates, WEEKS } from '../store/useStore'
import QuizTimer from '../components/quiz/QuizTimer'
import QuestionCard from '../components/quiz/QuestionCard'
import QuestionNav from '../components/quiz/QuestionNav'
import QuizResults from '../components/quiz/QuizResults'

function isInQuizWindow(quizDates) {
  const now = new Date()
  if (quizDates?.date1 || quizDates?.date2) {
    for (const key of ['date1', 'date2']) {
      if (!quizDates[key]) continue
      const start = new Date(quizDates[key])
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
      if (now >= start && now < end) return true
    }
    return false
  }
  const day = now.getDay(), h = now.getHours(), m = now.getMinutes()
  const mins = h * 60 + m
  return (day === 5 || day === 6) && mins >= 17 * 60 && mins < 19 * 60
}

function shuffleAndPick(arr, count) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(count, arr.length))
}

const ABBR = {
  'Mathematics': 'Math', 'English Language': 'English', 'Physics': 'Physics',
  'Chemistry': 'Chem', 'Biology': 'Bio', 'Government': 'Govt',
  'Economics': 'Econ', 'Literature in English': 'Lit',
}

export default function Quiz({ student, setView, setLastScore, retakeData, setRetakeData }) {
  const [step, setStep] = useState('init') // init | loading | quiz | done | locked | expired | error
  const [quizData, setQuizData] = useState({}) // { [subject]: { questions, answers, currentQ } }
  const [activeSubject, setActiveSubject] = useState(null)
  const [timeLeft, setTimeLeft] = useState(60 * 60)
  const [submitting, setSubmitting] = useState(false)
  const [allResults, setAllResults] = useState([])
  const [medalToast, setMedalToast] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(null)
  const [quizDates, setQuizDates] = useState(null)
  const [quizDatesReady, setQuizDatesReady] = useState(false)
  const [nextWeekTopics, setNextWeekTopics] = useState({})
  const [err, setErr] = useState('')
  const timerRef = useRef(null)

  const weekLabel = retakeData?.week || currentWeek || 'Week 1'
  const subjects = retakeData ? [retakeData.subject] : (student.subjects || [])

  useEffect(() => {
    const timeout = setTimeout(() => setQuizDatesReady(true), 5000)
    const unsubDates = listenQuizDates((dates) => {
      setQuizDates(dates)
      setQuizDatesReady(true)
      clearTimeout(timeout)
    })
    const unsubWeek = listenActiveWeek((week) => setCurrentWeek(week))
    return () => { unsubDates(); unsubWeek(); clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    if (!currentWeek) return
    const idx = WEEKS.indexOf(currentWeek)
    const next = WEEKS[Math.min(idx + 1, WEEKS.length - 1)]
    getTopics(next).then((t) => setNextWeekTopics(t || {}))
  }, [currentWeek])

  // Gate check: once dates + week are ready, decide what to show
  useEffect(() => {
    if (!quizDatesReady) return
    if (!currentWeek && !retakeData) return
    if (step !== 'init') return
    const { status } = getAccessStatus(student)
    if (status === 'expired') { setStep('expired'); return }
    if (!retakeData && !isInQuizWindow(quizDates)) { setStep('locked'); return }
    setStep('loading')
  }, [quizDatesReady, currentWeek])

  // Load questions when step becomes 'loading'
  useEffect(() => {
    if (step !== 'loading') return
    const week = retakeData?.week || weekLabel
    ;(async () => {
      setErr('')
      try {
        const data = {}
        await Promise.all(subjects.map(async (subj) => {
          const allQ = await getQuestions(subj, week)
          if (!allQ.length) return
          const limit = await getQuestionLimit(subj, week)
          const picked = shuffleAndPick(allQ, limit)
          data[subj] = { questions: picked, answers: new Array(picked.length).fill(null), currentQ: 0 }
        }))
        if (!Object.keys(data).length) {
          setErr(`No questions available for ${week} yet. Check back later.`)
          setStep('error')
          return
        }
        setQuizData(data)
        setActiveSubject(Object.keys(data)[0])
        setStep('quiz')
      } catch {
        setErr('Failed to load questions. Check your connection.')
        setStep('error')
      }
    })()
  }, [step])

  // Timer — runs only during quiz
  useEffect(() => {
    if (step !== 'quiz') return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [step])

  useEffect(() => {
    if (timeLeft === 0 && step === 'quiz') handleSubmitAll()
  }, [timeLeft])

  const setAnswer = (subj, qIdx, optIdx) => {
    setQuizData((prev) => ({
      ...prev,
      [subj]: { ...prev[subj], answers: prev[subj].answers.map((a, i) => i === qIdx ? optIdx : a) },
    }))
  }

  const setCurrentQ = (subj, idx) => {
    setQuizData((prev) => ({ ...prev, [subj]: { ...prev[subj], currentQ: idx } }))
  }

  const handleSubmitAll = async () => {
    if (submitting) return
    setSubmitting(true)
    clearInterval(timerRef.current)

    const results = []
    for (const subj of Object.keys(quizData)) {
      const { questions, answers } = quizData[subj]
      let correct = 0, wrong = 0, unanswered = 0
      questions.forEach((q, i) => {
        if (answers[i] === null) unanswered++
        else if (answers[i] === q.answer) correct++
        else wrong++
      })
      const score = Math.round((Math.max(0, correct * 4 - wrong) / (questions.length * 4)) * 100)
      results.push({
        studentId: student.id,
        studentName: student.name,
        subject: subj,
        week: weekLabel,
        score, outOf: 100, correct, wrong, unanswered, total: questions.length,
        answers,
        questions: questions.map((q) => ({
          question: q.question, options: q.options, answer: q.answer,
          explanation: q.explanation || '', image: q.image || '',
          optionImages: q.optionImages || ['', '', '', ''],
          explanationImage: q.explanationImage || '',
        })),
        date: new Date().toISOString(),
      })
    }

    try {
      await Promise.all(results.map((r) => addScore(r)))
      const cached = load('jamb_scores_cache', [])
      save('jamb_scores_cache', [...cached, ...results])
    } catch (e) {
      console.error('Save error:', e)
    }

    if (results.length > 0) setLastScore(results[0])
    if (setRetakeData) setRetakeData(null)

    const total = results.reduce((a, r) => a + r.score, 0)
    const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
    setAllResults(results)
    setMedalToast({ medal, total, max: results.length * 100 })
    setStep('done')
    setSubmitting(false)
  }

  const buildWAMsg = (phone, results) => {
    const total = results.reduce((a, r) => a + r.score, 0)
    const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
    const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', month: 'short', day: 'numeric' })
    const firstName = student.name.split(' ')[0]
    const lines = [
      `📊 *JAMB Mock Report – ${student.name}*`,
      `${weekLabel} | ${today}`, '',
      '*Subject Scores:*',
      ...results.map((r) => `• ${r.subject}: ${r.score}/100 ${r.score >= 70 ? '✅' : r.score >= 50 ? '🟡' : '⚠️'}`),
      '',
      `*Total Score: ${total}/${results.length * 100}* ${medal}`,
      '',
    ]
    const topicLines = Object.entries(nextWeekTopics)
      .map(([s, raw]) => { const t = normalizeTopic(raw); return t?.name ? `• ${s}: ${t.name}` : null })
      .filter(Boolean)
    if (topicLines.length) { lines.push('*Next Week Topics:*', ...topicLines, '') }
    if (total >= 280) lines.push(`💪 Outstanding! ${firstName} is excelling this week. Keep it up!`)
    else if (total >= 200) lines.push(`📈 Good effort! ${firstName} is on track. Consistent practice will push scores higher.`)
    else lines.push(`🔁 Tough week, but every mock is a lesson. Encourage ${firstName} to review corrections and come back stronger.`)
    lines.push('', '_274Days to identify weaknesses and fix them to ace JAMB_')
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
  }

  // ── GATE SCREENS ───────────────────────────────────────────────────────────
  if (step === 'init' || step === 'loading') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#111] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#888] font-label">Loading quiz…</p>
        </div>
      </div>
    )
  }

  if (step === 'expired') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">🔒</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Access Expired</h2>
          <p className="text-sm text-[#888] font-label mb-6">Your subscription has ended. Renew for ₦800/month to continue.</p>
          <div className="flex gap-2">
            <button onClick={() => setView('dashboard')} className="flex-1 border border-[#E5E5E5] text-[#555] py-3 rounded-xl text-sm font-bold font-display">Back</button>
            <button onClick={() => setView('subscribe')} className="flex-1 bg-[#111] text-white py-3 rounded-xl text-sm font-bold font-display">Subscribe →</button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'locked') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">🔒</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">Quiz Locked</h2>
          <p className="text-sm text-[#888] font-label mb-1">Login window: <strong className="text-[#111]">Fri & Sat · 5:00pm – 6:00pm</strong></p>
          <p className="text-sm text-[#888] font-label mb-6">Once started: <strong className="text-[#111]">1 hour</strong> for all subjects</p>
          <button onClick={() => setView('dashboard')} className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold font-display">Back to Dashboard</button>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-8 max-w-sm w-full text-center">
          <span className="text-3xl">😕</span>
          <h2 className="text-xl font-bold text-[#111] font-display mt-3 mb-2">No Questions Yet</h2>
          <p className="text-sm text-[#888] font-label mb-6">{err}</p>
          <button onClick={() => setView('dashboard')} className="bg-[#111] text-white px-6 py-3 rounded-xl text-sm font-bold font-display">Back to Dashboard</button>
        </div>
      </div>
    )
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (step === 'done') {
    const parentPhone = student.parentPhone?.replace(/\D/g, '')
    const teacherPhone = student.teacherPhone?.replace(/\D/g, '')

    return (
      <QuizResults allResults={allResults} weekLabel={weekLabel} medalToast={medalToast} setMedalToast={setMedalToast} nextWeekTopics={nextWeekTopics} parentPhone={parentPhone} teacherPhone={teacherPhone} buildWAMsg={buildWAMsg} student={student} onBackToDashboard={() => setView('dashboard')} onViewResults={() => setView('results')} />
    )
  }

  // ── ACTIVE QUIZ ────────────────────────────────────────────────────────────
  const subjectList = Object.keys(quizData)
  const current = activeSubject ? quizData[activeSubject] : null
  if (!current) return null

  const { questions, answers, currentQ } = current
  const q = questions[currentQ]
  const totalAnswered = subjectList.reduce((a, s) => a + quizData[s].answers.filter((x) => x !== null).length, 0)
  const totalQs = subjectList.reduce((a, s) => a + quizData[s].questions.length, 0)
  const subjIdx = subjectList.indexOf(activeSubject)
  const isLastSubj = subjIdx === subjectList.length - 1
  const isLastQ = currentQ === questions.length - 1

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="bg-white border-b border-[#EBEBEB] sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 pt-3">

          {/* Timer row */}
          <div className="flex justify-between items-center mb-2">
            <div>
              <p className="text-[10px] font-semibold text-[#888] uppercase tracking-wide font-label">{weekLabel}</p>
              <p className="text-sm font-bold text-[#111] font-display">
                Q{currentQ + 1}/{questions.length}
                <span className="text-[#AAA] font-normal text-xs ml-1.5">{totalAnswered}/{totalQs} answered</span>
              </p>
            </div>
            <QuizTimer timeLeft={timeLeft} />
          </div>

          {/* Subject tabs */}
          <div className="flex overflow-x-auto -mx-4 px-4 gap-0 scrollbar-hide">
            {subjectList.map((subj) => {
              const d = quizData[subj]
              const n = d.answers.filter((a) => a !== null).length
              const isActive = subj === activeSubject
              const abbr = ABBR[subj] || subj.split(' ')[0]
              return (
                <button key={subj} onClick={() => setActiveSubject(subj)}
                  className={`flex-shrink-0 flex flex-col items-center px-3 pb-2 pt-0.5 border-b-2 text-[11px] font-bold font-label transition-all ${
                    isActive ? 'text-[#111] border-[#111]' : 'text-[#AAA] border-transparent hover:text-[#555]'
                  }`}>
                  <span>{abbr}</span>
                  <span className={`text-[9px] mt-0.5 ${n === d.questions.length ? 'text-green-500' : isActive ? 'text-[#888]' : 'text-[#CCC]'}`}>
                    {n}/{d.questions.length}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Per-subject question progress bar */}
          <div className="w-full bg-[#F3F3F2] h-0.5">
            <div className="bg-[#111] h-0.5 transition-all" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pb-6">
        <QuestionCard question={q} selectedAnswer={answers[currentQ]} onSelectAnswer={(i) => setAnswer(activeSubject, currentQ, i)} disabled={submitting} />

        {/* Navigation */}
        <div className="flex gap-2.5 mb-4">
          {currentQ > 0 ? (
            <button onClick={() => setCurrentQ(activeSubject, currentQ - 1)}
              className="flex-1 bg-white border border-[#E5E5E5] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] font-label transition-colors">
              ← Prev
            </button>
          ) : <div className="flex-1" />}

          {!isLastQ ? (
            <button onClick={() => setCurrentQ(activeSubject, currentQ + 1)}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] transition-colors">
              Next →
            </button>
          ) : !isLastSubj ? (
            <button onClick={() => setActiveSubject(subjectList[subjIdx + 1])}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] transition-colors">
              {ABBR[subjectList[subjIdx + 1]] || subjectList[subjIdx + 1].split(' ')[0]} →
            </button>
          ) : (
            <button onClick={handleSubmitAll} disabled={submitting}
              className={`flex-1 rounded-xl py-3 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA]' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {submitting ? 'Submitting…' : 'Submit All ✓'}
            </button>
          )}
        </div>

        <QuestionNav total={questions.length} currentIndex={currentQ} answers={answers} onJump={(i) => setCurrentQ(activeSubject, i)} />

        {/* Always-visible submit all */}
        <button onClick={handleSubmitAll} disabled={submitting}
          className={`w-full rounded-xl py-3.5 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
          {submitting ? 'Submitting…' : `Submit All (${totalAnswered}/${totalQs} answered) ✓`}
        </button>
      </div>
    </div>
  )
}
