import { useState, useEffect, useRef } from 'react'
import { load, save, addScore, getQuestions, getTopics, getQuestionLimit, listenActiveWeek, normalizeTopic, getAccessStatus, listenQuizDates, WEEKS } from '../store/useStore'

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

const WaIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.524 5.845L0 24l6.289-1.506A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-4.988-1.364l-.358-.213-3.733.894.928-3.637-.232-.373A9.793 9.793 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
  </svg>
)

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
  const [expandedSubject, setExpandedSubject] = useState(null)
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

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

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
    lines.push('', '_274Lab · Diagnose · Discipline · Patch_')
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
    const total = allResults.reduce((a, r) => a + r.score, 0)
    const maxTotal = allResults.length * 100
    const medal = total >= 280 ? '🥇' : total >= 200 ? '🥈' : '🥉'
    const pct = Math.round((total / maxTotal) * 100)
    const parentPhone = student.parentPhone?.replace(/\D/g, '')
    const teacherPhone = student.teacherPhone?.replace(/\D/g, '')

    return (
      <div className="min-h-screen bg-[#F8F8F7] pb-10">

        {/* Medal toast overlay */}
        {medalToast && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setMedalToast(null)}>
            <div className="bg-white rounded-3xl p-8 text-center max-w-xs w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-7xl mb-3">{medalToast.medal}</p>
              <p className="text-xl font-bold text-[#111] font-display mb-1">
                {medalToast.medal === '🥇' ? 'Gold Medal!' : medalToast.medal === '🥈' ? 'Silver Medal!' : 'Bronze Medal!'}
              </p>
              <p className="text-sm text-[#888] font-label mb-1">{weekLabel}</p>
              <p className="text-2xl font-bold text-[#111] font-display mb-4">{medalToast.total} / {medalToast.max}</p>
              <button onClick={() => setMedalToast(null)} className="bg-[#111] text-white px-8 py-2.5 rounded-xl text-sm font-bold font-display">
                Continue →
              </button>
            </div>
          </div>
        )}

        <div className="max-w-md mx-auto px-4">
          <div className="flex items-center gap-3 pt-8 pb-4">
            <button onClick={() => setView('dashboard')} className="text-[#888] hover:text-[#111] text-sm font-label transition-colors">← Dashboard</button>
          </div>

          {/* Total score hero */}
          <div className="bg-[#111] text-white rounded-2xl p-6 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] font-semibold text-[#666] uppercase tracking-[0.2em] font-label">{weekLabel} · All Subjects</p>
                <div className="flex items-end gap-2 mt-1">
                  <span className="text-5xl font-bold font-display">{total}</span>
                  <span className="text-[#555] text-lg mb-1 font-label">/{maxTotal}</span>
                </div>
                <p className={`text-sm font-bold font-display mt-1 ${pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {pct >= 70 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep practising!'}
                </p>
              </div>
              <span className="text-5xl">{medal}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1">
              <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>

          {/* Per-subject breakdown with collapsible corrections */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
            <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">Subject Breakdown</p>
            <div className="divide-y divide-[#F3F3F2]">
              {allResults.map((r) => {
                const sp = r.score
                const isExp = expandedSubject === r.subject
                return (
                  <div key={r.subject}>
                    <button onClick={() => setExpandedSubject(isExp ? null : r.subject)} className="flex items-center gap-2.5 w-full py-3 text-left">
                      <p className="flex-1 text-sm font-semibold text-[#111] font-body">{r.subject}</p>
                      <div className="w-14 bg-[#F3F3F2] rounded-full h-1.5 shrink-0">
                        <div className={`h-1.5 rounded-full ${sp >= 70 ? 'bg-green-500' : sp >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${sp}%` }} />
                      </div>
                      <span className="text-sm font-bold font-display text-[#111] w-14 text-right shrink-0">{r.score}/100</span>
                      <span className={`text-[10px] font-bold font-label w-8 text-right shrink-0 ${sp >= 70 ? 'text-green-600' : sp >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>{sp}%</span>
                      <span className="text-[#CCC] text-xs shrink-0 w-3">{isExp ? '▲' : '▼'}</span>
                    </button>
                    {isExp && (
                      <div className="mb-3 space-y-2">
                        {r.questions.map((q, i) => {
                          const sa = r.answers[i]
                          const isOk = sa === q.answer
                          const isSkip = sa === null
                          return (
                            <div key={i} className={`rounded-xl p-3 border text-xs ${isOk ? 'bg-green-50 border-green-100' : isSkip ? 'bg-[#F8F8F7] border-[#EBEBEB]' : 'bg-red-50 border-red-100'}`}>
                              <p className="font-semibold text-[#111] mb-1.5 font-body leading-snug">{i + 1}. {q.question}</p>
                              {q.image && <img src={q.image} alt="Q" className="mb-2 max-h-40 w-full object-contain rounded-lg border border-[#EBEBEB] bg-white" />}
                              <div className="space-y-0.5 mb-1.5">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className={`px-2.5 py-1.5 rounded-lg font-label ${oi === q.answer ? 'bg-green-200 text-green-800 font-semibold' : oi === sa && !isOk ? 'bg-red-200 text-red-800' : 'text-[#888]'}`}>
                                    {String.fromCharCode(65 + oi)}. {opt}{oi === q.answer && ' ✓'}{oi === sa && !isOk && ' ✗'}
                                    {q.optionImages?.[oi] && <img src={q.optionImages[oi]} alt="" className="mt-1 max-h-20 rounded" />}
                                  </div>
                                ))}
                              </div>
                              {isSkip && <p className="text-[#AAA] font-label">Skipped</p>}
                              {q.explanation && (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mt-1.5">
                                  <p className="text-[10px] font-bold text-blue-700 font-label mb-0.5">Explanation</p>
                                  <p className="text-blue-600 font-label leading-relaxed whitespace-pre-line">{q.explanation}</p>
                                  {q.explanationImage && <img src={q.explanationImage} alt="" className="mt-1.5 max-h-40 w-full object-contain rounded-lg border border-blue-100" />}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* WhatsApp report */}
          {(parentPhone || teacherPhone) && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
              <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-0.5">Send Report via WhatsApp</p>
              <p className="text-[10px] text-[#AAA] font-label mb-3">Includes scores, next week topics & encouragement</p>
              <div className="space-y-2">
                {parentPhone && (
                  <a href={buildWAMsg(parentPhone, allResults)} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 w-full bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-3 transition-colors">
                    <WaIcon />
                    <div className="text-left">
                      <p className="text-sm font-bold font-display">Send to Parent</p>
                      <p className="text-[11px] text-green-200 font-label">{student.parentPhone}</p>
                    </div>
                  </a>
                )}
                {teacherPhone && (
                  <a href={buildWAMsg(teacherPhone, allResults)} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 w-full bg-[#111] hover:bg-[#222] text-white rounded-xl px-4 py-3 transition-colors">
                    <WaIcon />
                    <div className="text-left">
                      <p className="text-sm font-bold font-display">Send to Teacher</p>
                      <p className="text-[11px] text-[#666] font-label">{student.teacherPhone}</p>
                    </div>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Next week topics */}
          {Object.keys(nextWeekTopics).some((k) => normalizeTopic(nextWeekTopics[k])?.name) && (
            <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
              <p className="text-[11px] font-bold text-[#888] uppercase tracking-[0.15em] font-label mb-3">Next Week — Topics to Revise</p>
              <div className="space-y-2">
                {Object.entries(nextWeekTopics).map(([subj, raw]) => {
                  const t = normalizeTopic(raw)
                  if (!t?.name) return null
                  return (
                    <div key={subj} className="flex justify-between items-center py-1 gap-2">
                      <p className="text-xs text-[#555] font-body shrink-0">{subj}</p>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs text-[#111] font-semibold bg-[#F3F3F2] px-2.5 py-1 rounded-lg font-label truncate">{t.name}</p>
                        {t.video && <a href={t.video} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label shrink-0">▶</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <button onClick={() => setView('results')} className="w-full bg-white border border-[#EBEBEB] rounded-xl py-3 text-sm font-semibold text-[#555] hover:border-[#CCC] font-label transition-colors">
            View All Results →
          </button>
        </div>
      </div>
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
            <div className={`text-sm font-bold px-3 py-1.5 rounded-xl font-display ${timeLeft < 300 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-[#F3F3F2] text-[#111]'}`}>
              ⏱ {fmt(timeLeft)}
            </div>
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
        {/* Question card */}
        <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mt-4 mb-4">
          <p className="text-[#111] font-semibold text-base leading-relaxed font-body">{q.question}</p>
          {q.image && <img src={q.image} alt="Question" className="mt-3 max-h-72 w-full object-contain rounded-xl border border-[#EBEBEB] bg-[#F8F8F7]" />}
        </div>

        {/* Options */}
        <div className="space-y-2.5 mb-5">
          {q.options.map((option, i) => (
            <button key={i} onClick={() => setAnswer(activeSubject, currentQ, i)}
              className={`w-full p-4 rounded-xl border text-left text-sm transition-all active:scale-[0.99] ${
                answers[currentQ] === i ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-[#333] border-[#E5E5E5] hover:border-[#999]'
              }`}>
              <div className="flex items-start">
                <span className={`inline-flex w-6 h-6 rounded-full border items-center justify-center text-[11px] font-bold mr-3 shrink-0 ${
                  answers[currentQ] === i ? 'border-white/40 text-white' : 'border-[#CCC] text-[#888]'
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-body flex-1">{option}</span>
              </div>
              {q.optionImages?.[i] && <img src={q.optionImages[i]} alt={`Option ${i + 1}`} className="mt-2.5 max-h-40 w-full object-contain rounded-lg" />}
            </button>
          ))}
        </div>

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

        {/* Question dots */}
        <div className="flex gap-1 flex-wrap mb-5">
          {questions.map((_, i) => (
            <button key={i} onClick={() => setCurrentQ(activeSubject, i)}
              className={`w-8 h-8 rounded-lg text-xs font-bold font-label transition-colors ${
                i === currentQ ? 'bg-[#111] text-white' :
                answers[i] !== null ? 'bg-[#333] text-white' :
                'bg-white border border-[#E5E5E5] text-[#AAA]'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>

        {/* Always-visible submit all */}
        <button onClick={handleSubmitAll} disabled={submitting}
          className={`w-full rounded-xl py-3.5 text-sm font-bold font-display transition-colors ${submitting ? 'bg-[#EBEBEB] text-[#AAA] cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
          {submitting ? 'Submitting…' : `Submit All (${totalAnswered}/${totalQs} answered) ✓`}
        </button>
      </div>
    </div>
  )
}
